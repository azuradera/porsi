import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);

    if (!isObject(body)) {
      return NextResponse.json(
        { message: "Data permintaan tidak valid." },
        { status: 400 },
      );
    }

    const existingPackage = await prisma.package.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingPackage) {
      return NextResponse.json(
        { message: "Paket tidak ditemukan." },
        { status: 404 },
      );
    }

    const updateData: Prisma.PackageUpdateInput = {};

    if ("name" in body) {
      if (typeof body.name !== "string") {
        return NextResponse.json(
          { message: "Nama paket tidak valid." },
          { status: 400 },
        );
      }

      const name = body.name.trim();

      if (!name || name.length > 50) {
        return NextResponse.json(
          { message: "Nama paket wajib diisi dan maksimal 50 karakter." },
          { status: 400 },
        );
      }

      updateData.name = name;
    }

    if ("price" in body) {
      const validatedPrice = validatePrice(body.price);

      if ("error" in validatedPrice) {
        return NextResponse.json(
          { message: validatedPrice.error },
          { status: 400 },
        );
      }

      updateData.price = validatedPrice.price;
    }

    if ("dailyQuota" in body) {
      if (body.dailyQuota !== 2 && body.dailyQuota !== 3) {
        return NextResponse.json(
          { message: "Kuota harian hanya boleh 2 atau 3 kali." },
          { status: 400 },
        );
      }

      updateData.dailyQuota = body.dailyQuota;
    }

    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { message: "Status paket tidak valid." },
          { status: 400 },
        );
      }

      updateData.isActive = body.isActive;
    }

    if ("description" in body) {
      if (
        body.description !== null &&
        typeof body.description !== "string"
      ) {
        return NextResponse.json(
          { message: "Deskripsi paket tidak valid." },
          { status: 400 },
        );
      }

      updateData.description = null;
    }

    const normalizedMeals =
      "mealNames" in body
        ? normalizeMealNames(body.mealNames)
        : null;

    if (normalizedMeals && "error" in normalizedMeals) {
      return NextResponse.json(
        { message: normalizedMeals.error },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      if (normalizedMeals && "mealNames" in normalizedMeals) {
        const packageMeals = await tx.packageMeal.findMany({
          where: { packageId: id },
          select: {
            id: true,
            mealName: true,
            _count: {
              select: {
                mealPickups: true,
              },
            },
          },
        });

        const requestedNames = new Set(
          normalizedMeals.mealNames.map((name) =>
            name.toLocaleLowerCase("id-ID"),
          ),
        );

        const removedMealsWithHistory = packageMeals.filter(
          (meal) =>
            meal._count.mealPickups > 0 &&
            !requestedNames.has(
              meal.mealName.toLocaleLowerCase("id-ID"),
            ),
        );

        if (removedMealsWithHistory.length > 0) {
          throw new Error("MEAL_HAS_HISTORY");
        }

        const existingNames = new Set(
          packageMeals.map((meal) =>
            meal.mealName.toLocaleLowerCase("id-ID"),
          ),
        );

        const namesToCreate = normalizedMeals.mealNames.filter(
          (name) =>
            !existingNames.has(name.toLocaleLowerCase("id-ID")),
        );

        const namesToRemove = packageMeals.filter(
          (meal) =>
            !requestedNames.has(
              meal.mealName.toLocaleLowerCase("id-ID"),
            ),
        );

        if (namesToRemove.length > 0) {
          await tx.packageMeal.deleteMany({
            where: {
              id: {
                in: namesToRemove.map((meal) => meal.id),
              },
            },
          });
        }

        if (namesToCreate.length > 0) {
          await tx.packageMeal.createMany({
            data: namesToCreate.map((mealName) => ({
              packageId: id,
              mealName,
            })),
          });
        }
      }

      await tx.package.update({
        where: { id },
        data: updateData,
      });
    });

    const updatedPackage = await prisma.package.findUnique({
      where: { id },
      include: {
        meals: {
          orderBy: {
            mealName: "asc",
          },
        },
      },
    });

    if (!updatedPackage) {
      return NextResponse.json(
        { message: "Paket tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Paket berhasil diperbarui.",
      package: updatedPackage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MEAL_HAS_HISTORY") {
      return NextResponse.json(
        {
          message:
            "Menu yang sudah digunakan dalam riwayat pengambilan tidak boleh dihapus dari paket.",
        },
        { status: 409 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "Nama paket sudah digunakan." },
        { status: 409 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { message: "Paket tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Gagal memperbarui paket." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      (body as Record<string, unknown>).confirm !== true
    ) {
      return NextResponse.json(
        {
          message:
            "Penghapusan ditolak. Konfirmasi penghapusan permanen diperlukan.",
        },
        { status: 400 },
      );
    }

    const existingPackage = await prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!existingPackage) {
      return NextResponse.json(
        { message: "Paket tidak ditemukan." },
        { status: 404 },
      );
    }

    if (existingPackage._count.subscriptions > 0) {
      return NextResponse.json(
        {
          message:
            "Paket tidak dapat dihapus karena sudah memiliki riwayat langganan. Nonaktifkan paket jika tidak ingin menggunakannya lagi.",
        },
        { status: 409 },
      );
    }

    await prisma.package.delete({
      where: { id },
    });

    return NextResponse.json({
      message: `Paket "${existingPackage.name}" berhasil dihapus secara permanen.`,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { message: "Paket tidak ditemukan." },
        { status: 404 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          message:
            "Paket tidak dapat dihapus karena masih terhubung dengan data lain.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Gagal menghapus paket." },
      { status: 500 },
    );
  }
}