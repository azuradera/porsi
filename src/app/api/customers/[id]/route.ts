import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CustomerUpdateData = {
  name?: string;
  phone?: string | null;
  address?: string | null;
  status?: "ACTIVE" | "INACTIVE";
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

export async function GET(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Pelanggan tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json(
      { message: "Gagal mengambil data pelanggan" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { id } = await params;
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
    const updateData: CustomerUpdateData = {};

    if ("name" in data) {
      if (
        typeof data.name !== "string" ||
        !data.name.trim()
      ) {
        return NextResponse.json(
          { message: "Nama pelanggan wajib diisi" },
          { status: 400 },
        );
      }

      const name = data.name.trim();

      if (name.length > 100) {
        return NextResponse.json(
          { message: "Nama pelanggan maksimal 100 karakter" },
          { status: 400 },
        );
      }

      updateData.name = name;
    }

    if ("phone" in data) {
      if (
        data.phone !== null &&
        typeof data.phone !== "string"
      ) {
        return NextResponse.json(
          { message: "Nomor telepon tidak valid" },
          { status: 400 },
        );
      }

      const phone =
        typeof data.phone === "string"
          ? data.phone.trim()
          : "";

      if (phone.length > 20) {
        return NextResponse.json(
          { message: "Nomor telepon maksimal 20 karakter" },
          { status: 400 },
        );
      }

      updateData.phone = phone || null;
    }

    if ("address" in data) {
      if (
        data.address !== null &&
        typeof data.address !== "string"
      ) {
        return NextResponse.json(
          { message: "Alamat tidak valid" },
          { status: 400 },
        );
      }

      const address =
        typeof data.address === "string"
          ? data.address.trim()
          : "";

      if (address.length > 5000) {
        return NextResponse.json(
          { message: "Alamat maksimal 5000 karakter" },
          { status: 400 },
        );
      }

      updateData.address = address || null;
    }

    if ("status" in data) {
      if (
        data.status !== "ACTIVE" &&
        data.status !== "INACTIVE"
      ) {
        return NextResponse.json(
          {
            message:
              "Status pelanggan harus ACTIVE atau INACTIVE",
          },
          { status: 400 },
        );
      }

      updateData.status = data.status;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: "Tidak ada data yang diperbarui" },
        { status: 400 },
      );
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Data pelanggan berhasil diperbarui",
      customer,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return NextResponse.json(
        { message: "Pelanggan tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Gagal memperbarui data pelanggan" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin(request);

  if (auth) {
    return auth;
  }

  try {
    const { id } = await params;
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
            "Penghapusan ditolak. Konfirmasi penghapusan permanen terlebih dahulu.",
        },
        { status: 400 },
      );
    }

    await prisma.customer.delete({
      where: { id },
    });

    return NextResponse.json({
      message:
        "Pelanggan beserta data terkait berhasil dihapus secara permanen",
    });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return NextResponse.json(
        { message: "Pelanggan tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        message:
          "Gagal menghapus pelanggan. Periksa hubungan data pelanggan di basis data.",
      },
      { status: 500 },
    );
  }
}