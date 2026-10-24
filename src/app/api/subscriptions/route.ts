import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import {
  addCalendarDays,
  getBusinessDate,
  parseBusinessDate,
} from "@/lib/date";

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const packageId = searchParams.get("packageId");
    const status = searchParams.get("status");

    const where: Prisma.SubscriptionWhereInput = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (packageId) {
      where.packageId = packageId;
    }

    if (status) {
      if (
        status !== "ACTIVE" &&
        status !== "COMPLETED" &&
        status !== "CANCELLED"
      ) {
        return NextResponse.json(
          { message: "Status langganan tidak valid" },
          { status: 400 },
        );
      }

      where.status = status;
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        customer: true,
        package: {
          include: {
            meals: {
              orderBy: {
                mealName: "asc",
              },
            },
          },
        },
        payments: {
          orderBy: {
            paymentDate: "desc",
          },
        },
        extensions: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: [
        {
          startDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    return NextResponse.json({
      count: subscriptions.length,
      subscriptions,
    });
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil data langganan" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const body: unknown = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { message: "Data permintaan tidak valid" },
        { status: 400 },
      );
    }

    const data = body as Record<string, unknown>;

    const customerId =
      typeof data.customerId === "string"
        ? data.customerId.trim()
        : "";

    const packageId =
      typeof data.packageId === "string"
        ? data.packageId.trim()
        : "";

    const paymentType = data.paymentType;

    const startDateValue =
      typeof data.startDate === "string"
        ? data.startDate.trim()
        : "";

    if (!customerId || !packageId || !startDateValue) {
      return NextResponse.json(
        {
          message:
            "ID pelanggan, ID paket, dan tanggal mulai wajib diisi",
        },
        { status: 400 },
      );
    }

    if (paymentType !== "HALF" && paymentType !== "FULL") {
      return NextResponse.json(
        { message: "Jenis pembayaran harus HALF atau FULL" },
        { status: 400 },
      );
    }

    let startDate: Date;

    try {
      startDate = parseBusinessDate(startDateValue);
    } catch {
      return NextResponse.json(
        { message: "Format tanggal mulai tidak valid" },
        { status: 400 },
      );
    }

    if (startDateValue < getBusinessDate()) {
      return NextResponse.json(
        { message: "Tanggal mulai tidak boleh sebelum hari ini" },
        { status: 400 },
      );
    }

    const durationDays = paymentType === "HALF" ? 15 : 30;
    const endDate = addCalendarDays(startDate, durationDays - 1);

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Customer"
          WHERE "id" = ${customerId}
          FOR UPDATE
        `;

        const customer = await tx.customer.findUnique({
          where: {
            id: customerId,
          },
        });

        if (!customer) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }

        if (customer.status !== "ACTIVE") {
          throw new Error("CUSTOMER_INACTIVE");
        }

        const packageData = await tx.package.findUnique({
          where: {
            id: packageId,
          },
        });

        if (!packageData) {
          throw new Error("PACKAGE_NOT_FOUND");
        }

        if (!packageData.isActive) {
          throw new Error("PACKAGE_INACTIVE");
        }

        const overlappingSubscription =
          await tx.subscription.findFirst({
            where: {
              customerId,
              status: {
                not: "CANCELLED",
              },
              startDate: {
                lte: endDate,
              },
              endDate: {
                gte: startDate,
              },
            },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
            },
          });

        if (overlappingSubscription) {
          throw new Error("SUBSCRIPTION_OVERLAP");
        }

        const price = new Prisma.Decimal(packageData.price);

        const paymentAmount =
          paymentType === "HALF"
            ? price.dividedBy(2)
            : price;

        const subscription = await tx.subscription.create({
          data: {
            customerId,
            packageId,
            price,
            startDate,
            endDate,
            status: "ACTIVE",
            payments: {
              create: {
                amount: paymentAmount,
                paymentDate: new Date(),
                method: null,
                notes:
                  paymentType === "HALF"
                    ? "Pembayaran paket 15 hari"
                    : "Pembayaran paket 30 hari",
              },
            },
          },
          include: {
            customer: true,
            package: {
              include: {
                meals: {
                  orderBy: {
                    mealName: "asc",
                  },
                },
              },
            },
            payments: true,
          },
        });

        return {
          subscription,
          durationDays,
          paymentAmount,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json(
      {
        message: "Langganan berhasil dibuat",
        subscription: result.subscription,
        durationDays: result.durationDays,
        paymentAmount: result.paymentAmount,
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    if (errorMessage === "CUSTOMER_NOT_FOUND") {
      return NextResponse.json(
        { message: "Pelanggan tidak ditemukan" },
        { status: 404 },
      );
    }

    if (errorMessage === "CUSTOMER_INACTIVE") {
      return NextResponse.json(
        { message: "Pelanggan tidak aktif" },
        { status: 409 },
      );
    }

    if (errorMessage === "PACKAGE_NOT_FOUND") {
      return NextResponse.json(
        { message: "Paket katering tidak ditemukan" },
        { status: 404 },
      );
    }

    if (errorMessage === "PACKAGE_INACTIVE") {
      return NextResponse.json(
        { message: "Paket katering tidak aktif" },
        { status: 409 },
      );
    }

    if (errorMessage === "SUBSCRIPTION_OVERLAP") {
      return NextResponse.json(
        {
          message:
            "Pelanggan masih memiliki langganan yang bertabrakan dengan periode baru",
        },
        { status: 409 },
      );
    }

    if (
      isPrismaError(error, "P2034") ||
      isPrismaError(error, "P2002")
    ) {
      return NextResponse.json(
        {
          message:
            "Transaksi mengalami konflik. Silakan ulangi permintaan",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal membuat langganan" },
      { status: 500 },
    );
  }
}