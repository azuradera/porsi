  import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  addCalendarDays,
  getBusinessDate,
  parseBusinessDate,
} from "@/lib/date";

function generateCustomerCode() {
  const letter = String.fromCharCode(65 + randomInt(26));
  const numbers = String(randomInt(100)).padStart(2, "0");

  return `${letter}${numbers}`;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");

    const where: Prisma.CustomerWhereInput = {};

    if (search) {
      where.OR = [
        {
          code: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (status) {
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return NextResponse.json(
          { message: "Status pelanggan tidak valid" },
          { status: 400 },
        );
      }

      where.status = status;
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        subscriptions: {
          include: {
            package: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      count: customers.length,
      customers,
    });
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil data pelanggan" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body: unknown = await request.json().catch(() => null);

    if (!isObject(body)) {
      return NextResponse.json(
        { message: "Data permintaan tidak valid" },
        { status: 400 },
      );
    }

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const phone =
      typeof body.phone === "string" ? body.phone.trim() : "";

    const address =
      typeof body.address === "string" ? body.address.trim() : "";

    if (!name) {
      return NextResponse.json(
        { message: "Nama pelanggan wajib diisi" },
        { status: 400 },
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { message: "Nama pelanggan maksimal 100 karakter" },
        { status: 400 },
      );
    }

    if (phone.length > 20) {
      return NextResponse.json(
        { message: "Nomor telepon maksimal 20 karakter" },
        { status: 400 },
      );
    }

    if (address.length > 5000) {
      return NextResponse.json(
        { message: "Alamat maksimal 5000 karakter" },
        { status: 400 },
      );
    }

    const hasPackageId = Object.prototype.hasOwnProperty.call(
      body,
      "packageId",
    );

    const hasStartDate = Object.prototype.hasOwnProperty.call(
      body,
      "startDate",
    );

    const hasPaymentType = Object.prototype.hasOwnProperty.call(
      body,
      "paymentType",
    );

    const hasAnySubscriptionField =
      hasPackageId || hasStartDate || hasPaymentType;

    if (
      hasAnySubscriptionField &&
      !(hasPackageId && hasStartDate && hasPaymentType)
    ) {
      return NextResponse.json(
        {
          message:
            "Paket, tanggal mulai, dan periode pembayaran wajib diisi bersama.",
        },
        { status: 400 },
      );
    }

    let packageId = "";
    let startDate: Date | null = null;
    let paymentType: "FULL" | "HALF" = "FULL";
    let durationDays = 0;

    if (hasAnySubscriptionField) {
      if (
        typeof body.packageId !== "string" ||
        !body.packageId.trim()
      ) {
        return NextResponse.json(
          { message: "Pilih paket katering terlebih dahulu." },
          { status: 400 },
        );
      }

      if (
        typeof body.startDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      ) {
        return NextResponse.json(
          { message: "Format tanggal mulai tidak valid." },
          { status: 400 },
        );
      }

      if (
        body.paymentType !== "FULL" &&
        body.paymentType !== "HALF"
      ) {
        return NextResponse.json(
          { message: "Periode pembayaran tidak valid." },
          { status: 400 },
        );
      }

      packageId = body.packageId.trim();
      paymentType = body.paymentType;
      durationDays = paymentType === "HALF" ? 15 : 30;

      try {
        startDate = parseBusinessDate(body.startDate);
      } catch {
        return NextResponse.json(
          { message: "Tanggal mulai tidak valid." },
          { status: 400 },
        );
      }

      const today = getBusinessDate(new Date());

      if (body.startDate < today) {
        return NextResponse.json(
          { message: "Tanggal mulai tidak boleh sebelum hari ini." },
          { status: 400 },
        );
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCustomerCode();

      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const customer = await tx.customer.create({
              data: {
                code,
                name,
                phone: phone || null,
                address: address || null,
              },
            });

            if (!hasAnySubscriptionField || !startDate) {
              return {
                customer,
                subscription: null,
                durationDays: null,
                paymentAmount: null,
              };
            }

            const packageData = await tx.package.findUnique({
              where: {
                id: packageId,
              },
            });

            if (!packageData) {
              throw new Error("PACKAGE_NOT_FOUND");
            }

            if (!packageData.isActive) {
              throw new Error("PACKAGE_INACTIVE");
            }

            const endDate = addCalendarDays(
              startDate,
              durationDays - 1,
            );

            const price = new Prisma.Decimal(packageData.price);

            const paymentAmount =
              paymentType === "HALF"
                ? price.dividedBy(2)
                : price;

            const subscription = await tx.subscription.create({
              data: {
                customerId: customer.id,
                packageId: packageData.id,
                price,
                startDate,
                endDate,
                status: "ACTIVE",
                payments: {
                  create: {
                    amount: paymentAmount,
                    paymentDate: new Date(),
                    method: null,
                    notes:
                      paymentType === "HALF"
                        ? "Pembayaran paket 15 hari"
                        : "Pembayaran paket 30 hari",
                  },
                },
              },
              include: {
                package: true,
                payments: true,
              },
            });

            return {
              customer,
              subscription,
              durationDays,
              paymentAmount: paymentAmount.toString(),
            };
          },
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        return NextResponse.json(
          {
            message: result.subscription
              ? "Pelanggan dan langganan berhasil ditambahkan"
              : "Pelanggan berhasil ditambahkan",
            ...result,
          },
          { status: 201 },
        );
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "PACKAGE_NOT_FOUND") {
            return NextResponse.json(
              { message: "Paket katering tidak ditemukan." },
              { status: 404 },
            );
          }

          if (error.message === "PACKAGE_INACTIVE") {
            return NextResponse.json(
              { message: "Paket katering sudah tidak aktif." },
              { status: 400 },
            );
          }
        }

        if (
          isPrismaError(error, "P2002") &&
          attempt < 4
        ) {
          continue;
        }

        if (isPrismaError(error, "P2034")) {
          return NextResponse.json(
            {
              message:
                "Data sedang diproses bersamaan. Silakan simpan kembali.",
            },
            { status: 409 },
          );
        }

        throw error;
      }
    }

    return NextResponse.json(
      { message: "Gagal menghasilkan kode pelanggan unik." },
      { status: 503 },
    );
  } catch {
    return NextResponse.json(
      { message: "Gagal menyimpan data pelanggan." },
      { status: 500 },
    );
  }
}