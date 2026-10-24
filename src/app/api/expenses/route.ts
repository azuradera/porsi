import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ExpenseCategory, Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-admin";
import { parseBusinessDate } from "@/lib/date";

const expenseCategories = Object.values(ExpenseCategory);

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const category = searchParams.get("category");

    const where: Prisma.ExpenseWhereInput = {};

    if (startDate) {
      try {
        where.expenseDate = {
          ...(where.expenseDate as Prisma.DateTimeFilter),
          gte: parseBusinessDate(startDate),
        };
      } catch {
        return NextResponse.json(
          { message: "Tanggal awal tidak valid" },
          { status: 400 },
        );
      }
    }

    if (endDate) {
      try {
        where.expenseDate = {
          ...(where.expenseDate as Prisma.DateTimeFilter),
          lte: parseBusinessDate(endDate),
        };
      } catch {
        return NextResponse.json(
          { message: "Tanggal akhir tidak valid" },
          { status: 400 },
        );
      }
    }

    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        {
          message: "Tanggal awal tidak boleh melebihi tanggal akhir",
        },
        { status: 400 },
      );
    }

    if (category) {
      if (!expenseCategories.includes(category as ExpenseCategory)) {
        return NextResponse.json(
          { message: "Kategori pengeluaran tidak valid" },
          { status: 400 },
        );
      }

      where.category = category as ExpenseCategory;
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: [
        { expenseDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const total = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0,
    );

    return NextResponse.json({
      total,
      count: expenses.length,
      expenses,
    });
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil data pengeluaran" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const body: unknown = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { message: "Data permintaan tidak valid" },
        { status: 400 },
      );
    }

    const data = body as Record<string, unknown>;

    const description =
      typeof data.description === "string"
        ? data.description.trim()
        : "";

    const category =
      typeof data.category === "string"
        ? data.category
        : "";

    const amount = data.amount;

    const expenseDate =
      typeof data.expenseDate === "string"
        ? data.expenseDate
        : "";

    const notes =
      typeof data.notes === "string"
        ? data.notes.trim()
        : null;

    if (!description || !expenseDate || amount === undefined) {
      return NextResponse.json(
        {
          message: "Deskripsi, nominal, dan tanggal wajib diisi",
        },
        { status: 400 },
      );
    }

    if (description.length > 150) {
      return NextResponse.json(
        { message: "Deskripsi maksimal 150 karakter" },
        { status: 400 },
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.round(amount * 100) !== amount * 100
    ) {
      return NextResponse.json(
        {
          message:
            "Nominal harus berupa angka positif dengan maksimal dua angka desimal",
        },
        { status: 400 },
      );
    }

    let parsedDate: Date;

    try {
      parsedDate = parseBusinessDate(expenseDate);
    } catch {
      return NextResponse.json(
        { message: "Tanggal pengeluaran tidak valid" },
        { status: 400 },
      );
    }

    const selectedCategory = category
      ? category
      : "OTHER";

    if (
      !expenseCategories.includes(
        selectedCategory as ExpenseCategory,
      )
    ) {
      return NextResponse.json(
        { message: "Kategori pengeluaran tidak valid" },
        { status: 400 },
      );
    }

    if (notes && notes.length > 5000) {
      return NextResponse.json(
        { message: "Catatan maksimal 5000 karakter" },
        { status: 400 },
      );
    }

    const expense = await prisma.expense.create({
      data: {
        description,
        category: selectedCategory as ExpenseCategory,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        expenseDate: parsedDate,
        notes,
      },
    });

    return NextResponse.json(
      {
        message: "Pengeluaran berhasil dicatat",
        expense,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "Gagal mencatat pengeluaran" },
      { status: 500 },
    );
  }
}