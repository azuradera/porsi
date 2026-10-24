import { NextResponse } from "next/server";
import {
  createAdminSession,
  SESSION_COOKIE_NAME,
  verifyAdminPassword,
} from "@/lib/auth";


export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { message: "Permintaan tidak valid" },
        { status: 400 },
      );
    }

    const password = (body as Record<string, unknown>).password;

    if (typeof password !== "string" || password.length === 0) {
      return NextResponse.json(
        { message: "Kata sandi wajib diisi" },
        { status: 400 },
      );
    }

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { message: "Kata sandi salah" },
        { status: 401 },
      );
    }

    const session = createAdminSession();

    const response = NextResponse.json({
      message: "Login berhasil",
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.value,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
    });

    return response;
  } catch {
    return NextResponse.json(
      { message: "Autentikasi belum dikonfigurasi dengan benar" },
      { status: 500 },
    );
  }
}