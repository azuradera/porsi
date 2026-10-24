import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyAdminSession } from "@/lib/auth";

export async function requireAdmin(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return NextResponse.json(
      { message: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 },
    );
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());

  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${SESSION_COOKIE_NAME}=`),
  );

  const session = sessionCookie
    ? decodeURIComponent(
        sessionCookie.slice(SESSION_COOKIE_NAME.length + 1),
      )
    : undefined;

  if (!verifyAdminSession(session)) {
    return NextResponse.json(
      { message: "Sesi admin tidak valid atau sudah kedaluwarsa." },
      { status: 401 },
    );
  }

  return null;
}