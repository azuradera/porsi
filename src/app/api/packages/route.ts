import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeMealNames(value: unknown):
  | { mealNames: string[] }
  | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "Daftar menu harus berupa array." };
  }

  const mealNames: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return { error: "Semua nama menu harus berupa teks." };
    }

    const mealName = item.trim();

    if (!mealName) {
      continue;
    }

    if (mealName.length > 50) {
      return { error: "Nama menu maksimal 50 karakter." };
    }

    mealNames.push(mealName);
  }

  if (mealNames.length === 0) {
    return { error: "Minimal satu jenis menu harus diisi." };
  }

  if (mealNames.length > 10) {
    return { error: "Maksimal sepuluh jenis menu per paket." };
  }

  const normalizedNames = mealNames.map((meal) =>
    meal.toLocaleLowerCase("id-ID"),
  );

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return { error: "Jenis menu tidak boleh duplikat." };
  }

  return { mealNames };
}

function validatePrice(value: unknown):
  | { price: Prisma.Decimal }
  | { error: string } {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 9999999999.99 ||
    Math.round(value * 100) !== value * 100
  ) {
    return {
      error:
        "Harga paket harus berupa angka positif dengan maksimal dua angka desimal.",
    };
  }

  return {
    price: new Prisma.Decimal(value.toFixed(2)),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const packages = await prisma.package.findMany({
      include: {
        meals: {
          orderBy: {
            mealName: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(packages);
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil data paket." },
      { status: 500 },
    );
  }
}

const packages = await prisma.package.findMany({
  include: {
    meals: {
      orderBy: {
        mealName: "asc",
      },
    },
    _count: {
      select: {
        subscriptions: true,
      },
    },
  },
  orderBy: {
    createdAt: "desc",
  },
});

export async function POST(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const body: unknown = await request.json().catch(() => null);

    if (!isObject(body)) {
      return NextResponse.json(
        { message: "Data permintaan tidak valid." },
        { status: 400 },
      );
    }

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > 50) {
      return NextResponse.json(
        { message: "Nama paket wajib diisi dan maksimal 50 karakter." },
        { status: 400 },
      );
    }

    const validatedPrice = validatePrice(body.price);

    if ("error" in validatedPrice) {
      return NextResponse.json(
        { message: validatedPrice.error },
        { status: 400 },
      );
    }

    const normalizedMeals = normalizeMealNames(body.mealNames);

    if ("error" in normalizedMeals) {
      return NextResponse.json(
        { message: normalizedMeals.error },
        { status: 400 },
      );
    }

    const dailyQuota =
      body.dailyQuota === undefined ? 2 : body.dailyQuota;

    if (dailyQuota !== 2 && dailyQuota !== 3) {
      return NextResponse.json(
        { message: "Kuota harian hanya boleh 2 atau 3 kali." },
        { status: 400 },
      );
    }

    const createdPackage = await prisma.package.create({
      data: {
        name,
        description: null,
        price: validatedPrice.price,
        durationDays: 30,
        dailyQuota,
        meals: {
          create: normalizedMeals.mealNames.map((mealName) => ({
            mealName,
          })),
        },
      },
      include: {
        meals: {
          orderBy: {
            mealName: "asc",
          },
        },
          _count: {
        select: {
          subscriptions: true,
        },
      },
      },
    });

    return NextResponse.json(
      {
        message: "Paket katering berhasil dibuat.",
        package: createdPackage,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "Nama paket sudah digunakan." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal membuat paket katering." },
      { status: 500 },
    );
  }
}