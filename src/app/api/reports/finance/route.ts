import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBusinessDate } from "@/lib/date";
import { requireAdmin } from "@/lib/require-admin";

function getMonthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("INVALID_MONTH_FORMAT");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new Error("INVALID_MONTH");
  }

  const startDate = parseBusinessDate(`${month}-01`);
  const nextMonthDate =
    monthNumber === 12
      ? parseBusinessDate(`${String(year + 1).padStart(4, "0")}-01-01`)
      : parseBusinessDate(
          `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`,
        );

  return {
    startDate,
    endDate: nextMonthDate,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json(
        { message: "Parameter month wajib diisi dengan format YYYY-MM" },
        { status: 400 },
      );
    }

    let range: ReturnType<typeof getMonthRange>;

    try {
      range = getMonthRange(month);
    } catch {
      return NextResponse.json(
        { message: "Bulan tidak valid. Gunakan format YYYY-MM" },
        { status: 400 },
      );
    }

    const { startDate, endDate } = range;

    const [payments, subscriptions] = await Promise.all([
      prisma.payment.findMany({
        where: {
          paymentDate: {
            gte: startDate,
            lt: endDate,
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
          paymentDate: "asc",
        },
      }),

      prisma.subscription.findMany({
        where: {
          startDate: {
            lt: endDate,
          },
          endDate: {
            gte: startDate,
          },
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          id: true,
          price: true,
          startDate: true,
          endDate: true,
          status: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          package: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const totalRevenue = payments.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );

    const paymentCount = payments.length;

    return NextResponse.json({
      month,
      period: {
        startDate: startDate.toISOString().slice(0, 10),
        endDateExclusive: endDate.toISOString().slice(0, 10),
      },
      summary: {
        totalRevenue,
        paymentCount,
        subscriptionCount: subscriptions.length,
      },
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        notes: payment.notes,
        customerCode: payment.subscription.customer.code,
        customerName: payment.subscription.customer.name,
        packageName: payment.subscription.package.name,
      })),
      subscriptions,
    });
  } catch {
    return NextResponse.json(
      { message: "Gagal membuat laporan keuangan" },
      { status: 500 },
    );
  }
}