import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";

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

    const subscription = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Subscription"
          WHERE "id" = ${id}
          FOR UPDATE
        `;

        const existing = await tx.subscription.findUnique({
          where: { id },
          include: {
            customer: true,
            package: true,
          },
        });

        if (!existing) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        if (existing.status === "CANCELLED") {
          throw new Error("SUBSCRIPTION_ALREADY_CANCELLED");
        }

        if (existing.status === "COMPLETED") {
          throw new Error("SUBSCRIPTION_ALREADY_COMPLETED");
        }

        const updated = await tx.subscription.update({
          where: { id },
          data: {
            status: "CANCELLED",
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
            payments: {
              orderBy: {
                paymentDate: "desc",
              },
            },
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json({
      message: "Langganan berhasil dibatalkan",
      subscription,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SUBSCRIPTION_NOT_FOUND") {
        return NextResponse.json(
          { message: "Langganan tidak ditemukan" },
          { status: 404 },
        );
      }

      if (error.message === "SUBSCRIPTION_ALREADY_CANCELLED") {
        return NextResponse.json(
          { message: "Langganan sudah dibatalkan sebelumnya" },
          { status: 409 },
        );
      }

      if (error.message === "SUBSCRIPTION_ALREADY_COMPLETED") {
        return NextResponse.json(
          {
            message:
              "Langganan yang sudah selesai tidak dapat dibatalkan",
          },
          { status: 409 },
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
            "Terjadi konflik transaksi. Silakan ulangi permintaan",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal membatalkan langganan" },
      { status: 500 },
    );
  }
}