import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import { getBusinessDate, parseBusinessDate } from "@/lib/date";

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

function parsePickupTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  return new Date(`1970-01-01T${value}:00.000Z`);
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

    const where: Prisma.MealPickupWhereInput = {};

    if (date) {
      try {
        where.pickupDate = parseBusinessDate(date);
      } catch {
        return NextResponse.json(
          {
            message:
              "Tanggal harus valid dengan format YYYY-MM-DD",
          },
          { status: 400 },
        );
      }
    }

    const pickups = await prisma.mealPickup.findMany({
      where,
      include: {
        subscription: {
          include: {
            customer: true,
            package: true,
          },
        },
        packageMeal: true,
      },
      orderBy: [
        { pickupDate: "desc" },
        { pickupTime: "desc" },
      ],
    });

    return NextResponse.json(pickups);
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil riwayat pengambilan makanan" },
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

    const subscriptionId =
      typeof data.subscriptionId === "string"
        ? data.subscriptionId.trim()
        : "";

    const packageMealId =
      typeof data.packageMealId === "string"
        ? data.packageMealId.trim()
        : "";

    const pickupDate =
      typeof data.pickupDate === "string"
        ? data.pickupDate
        : "";

    const pickupTime =
      typeof data.pickupTime === "string"
        ? data.pickupTime
        : "";

    const quantity =
      data.quantity === undefined ? 1 : data.quantity;

    if (
      !subscriptionId ||
      !packageMealId ||
      !pickupDate ||
      !pickupTime
    ) {
      return NextResponse.json(
        {
          message:
            "Langganan, lauk, tanggal, dan waktu wajib diisi",
        },
        { status: 400 },
      );
    }

    let parsedDate: Date;

    try {
      parsedDate = parseBusinessDate(pickupDate);
    } catch {
      return NextResponse.json(
        { message: "Tanggal pengambilan tidak valid" },
        { status: 400 },
      );
    }

    const today = parseBusinessDate(getBusinessDate());

    if (parsedDate > today) {
      return NextResponse.json(
        {
          message:
            "Tanggal pengambilan tidak boleh di masa depan",
        },
        { status: 400 },
      );
    }

    const parsedTime = parsePickupTime(pickupTime);

    if (!parsedTime) {
      return NextResponse.json(
        { message: "Waktu harus valid dengan format HH:mm" },
        { status: 400 },
      );
    }

    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      return NextResponse.json(
        {
          message:
            "Jumlah pengambilan harus berupa bilangan bulat positif",
        },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await lockSubscription(tx, subscriptionId);

        const subscription = await tx.subscription.findUnique({
          where: { id: subscriptionId },
          include: {
            customer: true,
            package: true,
          },
        });

        if (!subscription) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        if (subscription.customer.status !== "ACTIVE") {
          throw new Error("CUSTOMER_INACTIVE");
        }

        if (subscription.status !== "ACTIVE") {
          throw new Error("SUBSCRIPTION_INACTIVE");
        }

        if (
          parsedDate < subscription.startDate ||
          parsedDate > subscription.endDate
        ) {
          throw new Error("OUTSIDE_SUBSCRIPTION_PERIOD");
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
          throw new Error("PICKUP_DATE_ALREADY_PROCESSED");
        }

        if (processedDay) {
          throw new Error("PICKUP_DATE_PROCESSING");
        }

        const noMealDay = await tx.noMealDay.findUnique({
          where: {
            subscriptionId_date: {
              subscriptionId,
              date: parsedDate,
            },
          },
        });

        if (noMealDay) {
          throw new Error("NO_MEAL_DAY_RECORDED");
        }

        const packageMeal = await tx.packageMeal.findUnique({
          where: { id: packageMealId },
        });

        if (
          !packageMeal ||
          packageMeal.packageId !== subscription.packageId
        ) {
          throw new Error("MEAL_NOT_IN_PACKAGE");
        }

        const dailyPickups = await tx.mealPickup.aggregate({
          where: {
            subscriptionId,
            pickupDate: parsedDate,
          },
          _sum: {
            quantity: true,
          },
        });

        const currentQuantity =
          dailyPickups._sum.quantity ?? 0;

        if (
          currentQuantity + quantity >
          subscription.package.dailyQuota
        ) {
          throw new Error("DAILY_QUOTA_EXCEEDED");
        }

        const pickup = await tx.mealPickup.create({
          data: {
            subscriptionId,
            packageMealId,
            pickupDate: parsedDate,
            pickupTime: parsedTime,
            quantity,
          },
          include: {
            packageMeal: true,
            subscription: {
              include: {
                customer: true,
                package: true,
              },
            },
          },
        });

        return {
          pickup,
          remainingQuota:
            subscription.package.dailyQuota -
            currentQuantity -
            quantity,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json(
      {
        message: "Pengambilan makanan berhasil dicatat",
        ...result,
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
          message: "Langganan tidak ditemukan",
          status: 404,
        },
        CUSTOMER_INACTIVE: {
          message: "Pelanggan tidak aktif",
          status: 409,
        },
        SUBSCRIPTION_INACTIVE: {
          message: "Langganan tidak aktif",
          status: 409,
        },
        OUTSIDE_SUBSCRIPTION_PERIOD: {
          message:
            "Tanggal pengambilan berada di luar masa langganan",
          status: 409,
        },
        PICKUP_DATE_ALREADY_PROCESSED: {
          message:
            "Tanggal pengambilan sudah selesai diproses",
          status: 409,
        },
        PICKUP_DATE_PROCESSING: {
          message:
            "Tanggal pengambilan sedang diproses sistem",
          status: 409,
        },
        MEAL_NOT_IN_PACKAGE: {
          message: "Lauk tidak tersedia dalam paket pelanggan",
          status: 400,
        },
        DAILY_QUOTA_EXCEEDED: {
          message:
            "Kuota pengambilan harian sudah tidak mencukupi",
          status: 409,
        },
        NO_MEAL_DAY_RECORDED: {
        message: "Tanggal tersebut sudah ditandai Tidak Ambil",
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
      isPrismaError(error, "P2034") ||
      isPrismaError(error, "P2002")
    ) {
      return NextResponse.json(
        {
          message:
            "Terjadi konflik transaksi. Silakan ulangi permintaan.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal mencatat pengambilan makanan" },
      { status: 500 },
    );
  }
}