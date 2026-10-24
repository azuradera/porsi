import { NextResponse } from "next/server";
import { extendSubscriptionManually } from "@/services/subscription-extension";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const days = body.days;
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { message: "Jumlah hari harus berupa bilangan bulat antara 1 dan 365" },
        { status: 400 },
      );
    }

    if (!reason) {
      return NextResponse.json(
        { message: "Alasan perpanjangan wajib diisi" },
        { status: 400 },
      );
    }

    const result = await extendSubscriptionManually(
      id,
      days,
      reason,
    );

    return NextResponse.json(
      {
        message: "Langganan berhasil diperpanjang",
        ...result,
      },
      { status: 200 },
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
        SUBSCRIPTION_CANCELLED: {
          message: "Langganan yang dibatalkan tidak dapat diperpanjang",
          status: 409,
        },
        INVALID_EXTENSION_DAYS: {
          message: "Jumlah hari perpanjangan tidak valid",
          status: 400,
        },
        EXTENSION_REASON_REQUIRED: {
          message: "Alasan perpanjangan wajib diisi",
          status: 400,
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

    return NextResponse.json(
      { message: "Gagal memperpanjang langganan" },
      { status: 500 },
    );
  }
}