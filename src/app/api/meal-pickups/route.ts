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
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
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

  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    const where: Prisma.MealPickupWhereInput = {};

    if (date) {
      try {
        where.pickupDate = parseBusinessDate(date);
      } catch {
        return NextResponse.json(
          { message: "Tanggal harus valid dengan format YYYY-MM-DD" },
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

  if (auth) return auth;

  try {
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
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

    const packageMealIds = Array.isArray(data.packageMealIds)
      ? data.packageMealIds
      : typeof data.packageMealId === "string"
        ? [data.packageMealId]
        : [];

    const pickupDate =
      typeof data.pickupDate === "string" ? data.pickupDate : "";

    const pickupTime =
      typeof data.pickupTime === "string" ? data.pickupTime : "";

    if (
      !subscriptionId ||
      !packageMealIds.length ||
      !packageMealIds.every(
        (id) => typeof id === "string" && id.trim().length > 0,
      ) ||
      !pickupDate ||
      !pickupTime
    ) {
      return NextResponse.json(
        { message: "Langganan, lauk, tanggal, dan waktu wajib diisi" },
        { status: 400 },
      );
    }

    const uniqueMealIds = [...new Set(
      packageMealIds.map((id) => (id as string).trim()),
    )];

    if (uniqueMealIds.length !== packageMealIds.length) {
      return NextResponse.json(
        { message: "Menu yang sama tidak boleh dipilih lebih dari sekali" },
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
        { message: "Tanggal pengambilan tidak boleh di masa depan" },
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

    const result = await prisma.$transaction(
      async (tx) => {
        await lockSubscription(tx, subscriptionId);

        const subscription = await tx.subscription.findUnique({
          where: { id: subscriptionId },
          include: {
            customer: true,
            package: {
              include: {
                meals: true,
              },
            },
          },
        });

        if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");

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

        if (noMealDay) throw new Error("NO_MEAL_DAY_RECORDED");

        if (uniqueMealIds.length > subscription.package.meals.length) {
          throw new Error("TOO_MANY_MEALS");
        }

        const packageMeals = await tx.packageMeal.findMany({
          where: {
            id: { in: uniqueMealIds },
            packageId: subscription.packageId,
          },
        });

        if (packageMeals.length !== uniqueMealIds.length) {
          throw new Error("MEAL_NOT_IN_PACKAGE");
        }

        const existingMealPickups = await tx.mealPickup.findMany({
          where: {
            subscriptionId,
            pickupDate: parsedDate,
            packageMealId: {
              in: uniqueMealIds,
            },
          },
          include: {
            packageMeal: true,
          },
        });

        if (existingMealPickups.length > 0) {
          const mealNames = existingMealPickups
            .map((pickup) => pickup.packageMeal.mealName)
            .join(", ");

          throw new Error(`MEAL_ALREADY_TAKEN:${mealNames}`);
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

        const currentQuantity = dailyPickups._sum.quantity ?? 0;
        const requestedQuantity = uniqueMealIds.length;

        if (
          currentQuantity + requestedQuantity >
          subscription.package.dailyQuota
        ) {
          throw new Error("DAILY_QUOTA_EXCEEDED");
        }

        const pickups = await Promise.all(
          uniqueMealIds.map((packageMealId) =>
            tx.mealPickup.create({
              data: {
                subscriptionId,
                packageMealId,
                pickupDate: parsedDate,
                pickupTime: parsedTime,
                quantity: 1,
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
            }),
          ),
        );

        return {
          pickups,
          remainingQuota:
            subscription.package.dailyQuota -
            currentQuantity -
            requestedQuantity,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json(
      {
        message: `${result.pickups.length} lauk berhasil dicatat`,
        ...result,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      const errors: Record<string, { message: string; status: number }> = {
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
          message: "Tanggal pengambilan berada di luar masa langganan",
          status: 409,
        },
        PICKUP_DATE_ALREADY_PROCESSED: {
          message: "Tanggal pengambilan sudah selesai diproses",
          status: 409,
        },
        PICKUP_DATE_PROCESSING: {
          message: "Tanggal pengambilan sedang diproses sistem",
          status: 409,
        },
        MEAL_NOT_IN_PACKAGE: {
          message: "Lauk tidak tersedia dalam paket pelanggan",
          status: 400,
        },
        TOO_MANY_MEALS: {
          message: "Jumlah lauk melebihi isi paket pelanggan",
          status: 400,
        },
        DAILY_QUOTA_EXCEEDED: {
          message: "Kuota pengambilan harian sudah tidak mencukupi",
          status: 409,
        },
        NO_MEAL_DAY_RECORDED: {
          message: "Tanggal tersebut sudah ditandai Tidak Ambil",
          status: 409,
        },
      };
      if (error.message.startsWith("MEAL_ALREADY_TAKEN:")) {
        const mealNames = error.message.replace("MEAL_ALREADY_TAKEN:", "");

        return NextResponse.json(
          {
            message: `${mealNames} sudah diambil pada tanggal tersebut. Pilih lauk lain.`,
          },
          { status: 409 },
        );
      }

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
        { message: "Terjadi konflik transaksi. Silakan ulangi permintaan." },
        { status: 409 },
      );
    }

    console.error("POST /api/meal-pickups error:", error);

    return NextResponse.json(
      { message: "Gagal mencatat pengambilan makanan" },
      { status: 500 },
    );
  }
}