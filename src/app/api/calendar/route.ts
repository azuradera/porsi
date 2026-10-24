import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { parseBusinessDate } from "@/lib/date";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);

    const startDateValue = searchParams.get("startDate");
    const endDateValue = searchParams.get("endDate");

    if (!startDateValue || !endDateValue) {
      return NextResponse.json(
        {
          message: "Tanggal mulai dan tanggal akhir wajib diisi",
        },
        { status: 400 },
      );
    }

    let startDate: Date;
    let endDate: Date;

    try {
      startDate = parseBusinessDate(startDateValue);
      endDate = parseBusinessDate(endDateValue);
    } catch {
      return NextResponse.json(
        { message: "Format tanggal harus YYYY-MM-DD" },
        { status: 400 },
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          message:
            "Tanggal mulai tidak boleh melewati tanggal akhir",
        },
        { status: 400 },
      );
    }

    const dayDifference =
      (endDate.getTime() - startDate.getTime()) /
      (24 * 60 * 60 * 1000);

    if (dayDifference > 61) {
      return NextResponse.json(
        {
          message: "Rentang kalender maksimal 62 hari",
        },
        { status: 400 },
      );
    }

    const [pickups, noMealDays, subscriptions] =
      await Promise.all([
        prisma.mealPickup.findMany({
          where: {
            pickupDate: {
              gte: startDate,
              lte: endDate,
            },
          },
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
            {
              pickupDate: "asc",
            },
            {
              pickupTime: "asc",
            },
          ],
        }),

        prisma.noMealDay.findMany({
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
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
        }),

        prisma.subscription.findMany({
          where: {
            startDate: {
              lte: endDate,
            },
            endDate: {
              gte: startDate,
            },
            status: {
              not: "CANCELLED",
            },
          },
          include: {
            customer: true,
            package: true,
          },
          orderBy: {
            startDate: "asc",
          },
        }),
      ]);

    const dailyPickupMap = new Map<
      string,
      {
        totalQuantity: number;
        pickupCount: number;
        subscriptionQuantities: Map<string, number>;
      }
    >();

    for (const pickup of pickups) {
      const date = pickup.pickupDate.toISOString().slice(0, 10);

      let dailyData = dailyPickupMap.get(date);

      if (!dailyData) {
        dailyData = {
          totalQuantity: 0,
          pickupCount: 0,
          subscriptionQuantities: new Map(),
        };

        dailyPickupMap.set(date, dailyData);
      }

      dailyData.totalQuantity += pickup.quantity;
      dailyData.pickupCount += 1;

      const subscriptionId = pickup.subscriptionId;

      dailyData.subscriptionQuantities.set(
        subscriptionId,
        (dailyData.subscriptionQuantities.get(subscriptionId) ?? 0) +
          pickup.quantity,
      );
    }

    const dailySummaries = Array.from(
      dailyPickupMap.entries(),
    ).map(([date, data]) => ({
      date,
      totalQuantity: data.totalQuantity,
      pickupCount: data.pickupCount,
    }));

    const pickupResults = pickups.map((pickup) => {
      const date = pickup.pickupDate.toISOString().slice(0, 10);
      const dailyData = dailyPickupMap.get(date);

      const subscriptionQuantity =
        dailyData?.subscriptionQuantities.get(
          pickup.subscriptionId,
        ) ?? 0;

      const dailyQuota = pickup.subscription.package.dailyQuota;

      return {
        id: pickup.id,
        date,
        time: pickup.pickupTime.toISOString().slice(11, 16),
        quantity: pickup.quantity,
        customer: {
          id: pickup.subscription.customer.id,
          code: pickup.subscription.customer.code,
          name: pickup.subscription.customer.name,
        },
        subscription: {
          id: pickup.subscription.id,
          status: pickup.subscription.status,
          startDate: pickup.subscription.startDate
            .toISOString()
            .slice(0, 10),
          endDate: pickup.subscription.endDate
            .toISOString()
            .slice(0, 10),
        },
        package: {
          id: pickup.subscription.package.id,
          name: pickup.subscription.package.name,
          dailyQuota,
        },
        meal: {
          id: pickup.packageMeal.id,
          name: pickup.packageMeal.mealName,
        },
        dailyUsedQuota: subscriptionQuantity,
        remainingQuota: Math.max(
          0,
          dailyQuota - subscriptionQuantity,
        ),
      };
    });

    const noMealDayResults = noMealDays.map((day) => ({
      id: day.id,
      date: day.date.toISOString().slice(0, 10),
      processed: day.processed,
      customer: {
        id: day.customer.id,
        code: day.customer.code,
        name: day.customer.name,
      },
      subscription: {
        id: day.subscription.id,
        status: day.subscription.status,
        packageName: day.subscription.package.name,
        startDate: day.subscription.startDate
          .toISOString()
          .slice(0, 10),
        endDate: day.subscription.endDate
          .toISOString()
          .slice(0, 10),
      },
      extension: day.extension
        ? {
            id: day.extension.id,
            type: day.extension.type,
            days: day.extension.days,
            previousEndDate: day.extension.previousEndDate
              .toISOString()
              .slice(0, 10),
            newEndDate: day.extension.newEndDate
              .toISOString()
              .slice(0, 10),
          }
        : null,
    }));

    const subscriptionResults = subscriptions.map(
      (subscription) => ({
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate
          .toISOString()
          .slice(0, 10),
        endDate: subscription.endDate
          .toISOString()
          .slice(0, 10),
        customer: {
          id: subscription.customer.id,
          code: subscription.customer.code,
          name: subscription.customer.name,
        },
        package: {
          id: subscription.package.id,
          name: subscription.package.name,
          dailyQuota: subscription.package.dailyQuota,
        },
      }),
    );

    return NextResponse.json({
      period: {
        startDate: startDateValue,
        endDate: endDateValue,
      },
      summary: {
        totalPickups: pickups.length,
        totalPickupQuantity: pickups.reduce(
          (total, pickup) => total + pickup.quantity,
          0,
        ),
        totalNoMealDays: noMealDays.length,
        totalSubscriptions: subscriptions.length,
      },
      dailySummaries,
      pickups: pickupResults,
      noMealDays: noMealDayResults,
      subscriptions: subscriptionResults,
    });
  } catch {
    return NextResponse.json(
      {
        message: "Gagal mengambil data kalender",
      },
      { status: 500 },
    );
  }
}