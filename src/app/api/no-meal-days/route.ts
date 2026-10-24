import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import { parseBusinessDate } from "@/lib/date";

async function lockSubscription(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Subscription"
    WHERE "id" = ${subscriptionId}
    FOR UPDATE
  `;
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const customerId = searchParams.get("customerId");

    const where: Prisma.NoMealDayWhereInput = {};

    if (date) {
      try {
        where.date = parseBusinessDate(date);
      } catch {
        return NextResponse.json(
          {
            message: "Tanggal harus valid dengan format YYYY-MM-DD",
          },
          { status: 400 },
        );
      }
    }

    if (customerId) {
      where.customerId = customerId;
    }

    const noMealDays = await prisma.noMealDay.findMany({
      where,
      include: {
        customer: true,
        subscription: {
          include: {
            package: true,
          },
        },
        extension: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    return NextResponse.json(noMealDays);
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil jadwal tidak mengambil makanan" },
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

    const subscriptionId =
      typeof data.subscriptionId === "string"
        ? data.subscriptionId.trim()
        : "";

    const date =
      typeof data.date === "string"
        ? data.date
        : "";

    if (!customerId || !subscriptionId || !date) {
      return NextResponse.json(
        {
          message: "Pelanggan, langganan, dan tanggal wajib diisi",
        },
        { status: 400 },
      );
    }

    let parsedDate: Date;

    try {
      parsedDate = parseBusinessDate(date);
    } catch {
      return NextResponse.json(
        {
          message: "Tanggal harus valid dengan format YYYY-MM-DD",
        },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await lockSubscription(tx, subscriptionId);

        const subscription = await tx.subscription.findFirst({
          where: {
            id: subscriptionId,
            customerId,
          },
          include: {
            customer: true,
          },
        });

        if (!subscription) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        if (
          subscription.status !== "ACTIVE" ||
          subscription.customer.status !== "ACTIVE"
        ) {
          throw new Error("SUBSCRIPTION_INACTIVE");
        }

        if (
          parsedDate < subscription.startDate ||
          parsedDate > subscription.endDate
        ) {
          throw new Error("DATE_OUTSIDE_SUBSCRIPTION");
        }

        const processedDay = await tx.subscriptionDay.findUnique({
          where: {
            subscriptionId_date: {
              subscriptionId,
              date: parsedDate,
            },
          },
        });

        if (processedDay?.processed) {
          throw new Error("DAY_ALREADY_PROCESSED");
        }

        if (processedDay) {
          throw new Error("DAY_PROCESSING");
        }

        const existingPickup = await tx.mealPickup.findFirst({
          where: {
            subscriptionId,
            pickupDate: parsedDate,
          },
        });

        if (existingPickup) {
          throw new Error("PICKUP_ALREADY_EXISTS");
        }

        const noMealDay = await tx.noMealDay.create({
          data: {
            customerId,
            subscriptionId,
            date: parsedDate,
          },
          include: {
            customer: true,
            subscription: {
              include: {
                package: true,
              },
            },
          },
        });

        return noMealDay;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json(
      {
        message: "Jadwal tidak mengambil makanan berhasil dicatat",
        noMealDay: result,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      const errors: Record<
        string,
        { message: string; status: number }
      > = {
        SUBSCRIPTION_NOT_FOUND: {
          message: "Langganan tidak ditemukan untuk pelanggan tersebut",
          status: 404,
        },
        SUBSCRIPTION_INACTIVE: {
          message: "Pelanggan atau langganan tidak aktif",
          status: 409,
        },
        DATE_OUTSIDE_SUBSCRIPTION: {
          message: "Tanggal berada di luar masa langganan",
          status: 409,
        },
        DAY_ALREADY_PROCESSED: {
          message: "Tanggal tersebut sudah selesai diproses",
          status: 409,
        },
        DAY_PROCESSING: {
          message: "Tanggal tersebut sedang diproses sistem",
          status: 409,
        },
        PICKUP_ALREADY_EXISTS: {
          message: "Pengambilan makanan sudah tercatat pada tanggal tersebut",
          status: 409,
        },
      };

      const knownError = errors[error.message];

      if (knownError) {
        return NextResponse.json(
          { message: knownError.message },
          { status: knownError.status },
        );
      }
    }

    if (
      isPrismaError(error, "P2002") ||
      isPrismaError(error, "P2034")
    ) {
      return NextResponse.json(
        {
          message:
            "Terjadi konflik transaksi. Periksa jadwal yang ada sebelum mencoba kembali.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal mencatat jadwal tidak mengambil makanan" },
      { status: 500 },
    );
  }
}