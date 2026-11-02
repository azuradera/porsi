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

    const result = await prisma.$transaction(
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
          },
        });

        if (!existing) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        await tx.$queryRaw`
          SELECT "id"
          FROM "Customer"
          WHERE "id" = ${existing.customerId}
          FOR UPDATE
        `;

        if (existing.status === "CANCELLED") {
          throw new Error("SUBSCRIPTION_ALREADY_CANCELLED");
        }

        if (existing.status === "COMPLETED") {
          throw new Error("SUBSCRIPTION_ALREADY_COMPLETED");
        }

        const subscription = await tx.subscription.update({
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

        const otherActiveSubscriptions =
          await tx.subscription.count({
            where: {
              customerId: existing.customerId,
              status: "ACTIVE",
            },
          });

        const customer = await tx.customer.update({
          where: {
            id: existing.customerId,
          },
          data: {
            status:
              otherActiveSubscriptions > 0
                ? "ACTIVE"
                : "INACTIVE",
          },
        });

        return {
          subscription,
          customer,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json({
      message: "Langganan berhasil dibatalkan",
      subscription: result.subscription,
      customer: result.customer,
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
            message: "Langganan yang sudah selesai tidak dapat dibatalkan",
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
          message: "Terjadi konflik transaksi. Silakan ulangi permintaan",
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