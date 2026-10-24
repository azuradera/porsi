import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import {
  addCalendarDays,
  getBusinessDate,
} from "@/lib/date";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { id } = await params;
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

    const packageId =
      typeof data.packageId === "string"
        ? data.packageId.trim()
        : "";

    const paymentType = data.paymentType;

    if (!packageId) {
      return NextResponse.json(
        { message: "Paket baru wajib dipilih" },
        { status: 400 },
      );
    }

    if (paymentType !== "HALF" && paymentType !== "FULL") {
      return NextResponse.json(
        { message: "Jenis pembayaran harus HALF atau FULL" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Subscription"
          WHERE "id" = ${id}
          FOR UPDATE
        `;

        const oldSubscription = await tx.subscription.findUnique({
          where: {
            id,
          },
          include: {
            customer: true,
            package: true,
          },
        });

        if (!oldSubscription) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        if (oldSubscription.status === "CANCELLED") {
          throw new Error("SUBSCRIPTION_CANCELLED");
        }

        const today = getBusinessDate();
        const oldEndDate = oldSubscription.endDate
          .toISOString()
          .slice(0, 10);

        if (
          oldSubscription.status === "ACTIVE" &&
          oldEndDate >= today
        ) {
          throw new Error("SUBSCRIPTION_STILL_ACTIVE");
        }

        await tx.$queryRaw`
          SELECT "id"
          FROM "Customer"
          WHERE "id" = ${oldSubscription.customerId}
          FOR UPDATE
        `;

        const customer = await tx.customer.findUnique({
          where: {
            id: oldSubscription.customerId,
          },
        });

        if (!customer || customer.status !== "ACTIVE") {
          throw new Error("CUSTOMER_INACTIVE");
        }

        const packageData = await tx.package.findUnique({
          where: {
            id: packageId,
          },
        });

        if (!packageData || !packageData.isActive) {
          throw new Error("PACKAGE_UNAVAILABLE");
        }

        const startDate = addCalendarDays(
          oldSubscription.endDate,
          1,
        );

        const durationDays = paymentType === "HALF" ? 15 : 30;

        const endDate = addCalendarDays(
          startDate,
          durationDays - 1,
        );

        const overlappingSubscription =
          await tx.subscription.findFirst({
            where: {
              customerId: oldSubscription.customerId,
              id: {
                not: oldSubscription.id,
              },
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
            customerId: oldSubscription.customerId,
            packageId: packageData.id,
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
                    ? "Pembayaran perpanjangan paket 15 hari"
                    : "Pembayaran perpanjangan paket 30 hari",
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

        if (oldSubscription.status === "ACTIVE") {
          await tx.subscription.update({
            where: {
              id: oldSubscription.id,
            },
            data: {
              status: "COMPLETED",
            },
          });
        }

        return {
          subscription,
          durationDays,
          paymentAmount,
          previousSubscriptionId: oldSubscription.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json(
      {
        message: "Perpanjangan langganan berhasil dibuat",
        subscription: result.subscription,
        durationDays: result.durationDays,
        paymentAmount: result.paymentAmount,
        previousSubscriptionId: result.previousSubscriptionId,
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    if (errorMessage === "SUBSCRIPTION_NOT_FOUND") {
      return NextResponse.json(
        { message: "Langganan sebelumnya tidak ditemukan" },
        { status: 404 },
      );
    }

    if (errorMessage === "SUBSCRIPTION_CANCELLED") {
      return NextResponse.json(
        {
          message:
            "Langganan yang dibatalkan tidak dapat diperpanjang",
        },
        { status: 409 },
      );
    }

    if (errorMessage === "SUBSCRIPTION_STILL_ACTIVE") {
      return NextResponse.json(
        {
          message:
            "Langganan masih berjalan dan belum dapat diperpanjang",
        },
        { status: 409 },
      );
    }

    if (errorMessage === "CUSTOMER_INACTIVE") {
      return NextResponse.json(
        {
          message:
            "Pelanggan tidak aktif sehingga perpanjangan ditolak",
        },
        { status: 409 },
      );
    }

    if (errorMessage === "PACKAGE_UNAVAILABLE") {
      return NextResponse.json(
        {
          message:
            "Paket tidak ditemukan atau sedang tidak aktif",
        },
        { status: 404 },
      );
    }

    if (errorMessage === "SUBSCRIPTION_OVERLAP") {
      return NextResponse.json(
        {
          message:
            "Periode perpanjangan bertabrakan dengan langganan lain",
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
            "Terjadi konflik transaksi. Silakan ulangi permintaan",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal memperpanjang langganan" },
      { status: 500 },
    );
  }
}