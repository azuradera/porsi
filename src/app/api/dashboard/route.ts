import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getBusinessDate, parseBusinessDate } from "@/lib/date";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const todayString = getBusinessDate();
    const today = parseBusinessDate(todayString);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const upcomingEndDate = new Date(today);
    upcomingEndDate.setUTCDate(upcomingEndDate.getUTCDate() + 7);

    const [
      activeCustomers,
      activeSubscriptions,
      todayPickups,
      todayNoMealDays,
      todayPayments,
      todayExpenses,
      upcomingSubscriptions,
      recentPayments,
      recentExpenses,
    ] = await Promise.all([
      prisma.customer.count({
        where: {
          status: "ACTIVE",
        },
      }),

      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          startDate: {
            lte: today,
          },
          endDate: {
            gte: today,
          },
          customer: {
            status: "ACTIVE",
          },
        },
      }),

      prisma.mealPickup.findMany({
        where: {
          pickupDate: today,
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
        orderBy: {
          pickupTime: "asc",
        },
      }),

      prisma.noMealDay.count({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),

      prisma.payment.findMany({
        where: {
          paymentDate: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          subscription: {
            include: {
              customer: true,
              package: true,
            },
          },
        },
        orderBy: {
          paymentDate: "desc",
        },
      }),

      prisma.expense.findMany({
        where: {
          expenseDate: {
            gte: today,
            lt: tomorrow,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          startDate: {
            lte: upcomingEndDate,
          },
          endDate: {
            gte: today,
            lte: upcomingEndDate,
          },
          customer: {
            status: "ACTIVE",
          },
        },
        include: {
          customer: true,
          package: true,
        },
        orderBy: {
          endDate: "asc",
        },
      }),

      prisma.payment.findMany({
        include: {
          subscription: {
            include: {
              customer: true,
              package: true,
            },
          },
        },
        orderBy: {
          paymentDate: "desc",
        },
        take: 5,
      }),

      prisma.expense.findMany({
        orderBy: {
          expenseDate: "desc",
        },
        take: 5,
      }),
    ]);

    const totalPickupQuantity = todayPickups.reduce(
      (total, pickup) => total + pickup.quantity,
      0,
    );

    const totalIncomeToday = todayPayments.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );

    const totalExpensesToday = todayExpenses.reduce(
      (total, expense) => total + Number(expense.amount),
      0,
    );

    return NextResponse.json({
      date: todayString,

      summary: {
        activeCustomers,
        activeSubscriptions,
        totalPickupRecords: todayPickups.length,
        totalPickupQuantity,
        totalNoMealDays: todayNoMealDays,
        totalIncomeToday,
        totalExpensesToday,
        netCashFlowToday: totalIncomeToday - totalExpensesToday,
        subscriptionsEndingSoon: upcomingSubscriptions.length,
      },

      todayPickups: todayPickups.map((pickup) => ({
        id: pickup.id,
        time: pickup.pickupTime.toISOString().slice(11, 16),
        quantity: pickup.quantity,
        customer: {
          id: pickup.subscription.customer.id,
          code: pickup.subscription.customer.code,
          name: pickup.subscription.customer.name,
        },
        package: {
          id: pickup.subscription.package.id,
          name: pickup.subscription.package.name,
        },
        meal: {
          id: pickup.packageMeal.id,
          name: pickup.packageMeal.mealName,
        },
      })),

      todayPayments: todayPayments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        customer: {
          id: payment.subscription.customer.id,
          code: payment.subscription.customer.code,
          name: payment.subscription.customer.name,
        },
        package: {
          id: payment.subscription.package.id,
          name: payment.subscription.package.name,
        },
      })),

      todayExpenses: todayExpenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        category: expense.category,
        amount: Number(expense.amount),
        expenseDate: expense.expenseDate
          .toISOString()
          .slice(0, 10),
      })),

      subscriptionsEndingSoon: upcomingSubscriptions.map(
        (subscription) => ({
          id: subscription.id,
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
          },
        }),
      ),

      recentPayments: recentPayments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        customerName: payment.subscription.customer.name,
        customerCode: payment.subscription.customer.code,
        packageName: payment.subscription.package.name,
      })),

      recentExpenses: recentExpenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        category: expense.category,
        amount: Number(expense.amount),
        expenseDate: expense.expenseDate
          .toISOString()
          .slice(0, 10),
      })),
    });
  } catch {
    return NextResponse.json(
      {
        message: "Gagal mengambil ringkasan dashboard",
      },
      { status: 500 },
    );
  }
}