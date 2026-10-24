import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getBusinessDate,
  parseBusinessDate,
} from "@/lib/date";
import { processSubscriptionDay } from "@/services/subscription-extension";

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { message: "Konfigurasi cron belum tersedia" },
        { status: 500 },
      );
    }

    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { message: "Akses ditolak" },
        { status: 401 },
      );
    }

    const today = parseBusinessDate(getBusinessDate());
    const yesterday = new Date(today);

    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const subscriptions = await prisma.subscription.findMany({
      where: {
        startDate: {
          lte: yesterday,
        },
        endDate: {
          gte: yesterday,
        },
        status: {
          in: ["ACTIVE", "COMPLETED"],
        },
        customer: {
          status: "ACTIVE",
        },
      },
      select: {
        id: true,
      },
    });

    const results: Array<{
      subscriptionId: string;
      status: string;
      message?: string;
    }> = [];

    for (const subscription of subscriptions) {
      try {
        const result = await processSubscriptionDay(
          subscription.id,
          yesterday,
        );

        results.push({
          subscriptionId: subscription.id,
          status: result.status,
        });
      } catch {
        results.push({
          subscriptionId: subscription.id,
          status: "PROCESSING_FAILED",
          message: "Gagal memproses hari langganan",
        });
      }
    }

    const failedCount = results.filter(
      (result) => result.status === "PROCESSING_FAILED",
    ).length;

    return NextResponse.json({
      message:
        failedCount === 0
          ? "Proses harian selesai"
          : "Proses harian selesai dengan beberapa kegagalan",
      date: yesterday.toISOString().slice(0, 10),
      totalSubscriptions: subscriptions.length,
      successfulCount: results.length - failedCount,
      failedCount,
      results,
    });
  } catch {
    return NextResponse.json(
      { message: "Gagal menjalankan proses harian" },
      { status: 500 },
    );
  }
}