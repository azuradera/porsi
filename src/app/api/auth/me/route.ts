import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!verifyAdminSession(session)) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
  });
}