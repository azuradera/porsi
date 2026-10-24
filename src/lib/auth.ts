import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "katering_admin_session";

const SESSION_DURATION = 8 * 60 * 60 * 1000;

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET belum dikonfigurasi dengan benar");
  }

  return secret;
}

function createSignature(expiresAt: string) {
  return createHmac("sha256", getSessionSecret())
    .update(`admin:${expiresAt}`)
    .digest("hex");
}

export function createAdminSession() {
  const expiresAt = String(Date.now() + SESSION_DURATION);
  const signature = createSignature(expiresAt);

  return {
    value: `${expiresAt}.${signature}`,
    expiresAt: new Date(Number(expiresAt)),
    maxAge: Math.floor(SESSION_DURATION / 1000),
  };
}

export function verifyAdminSession(value: string | undefined) {
  if (!value) {
    return false;
  }

  const parts = value.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [expiresAt, signature] = parts;

  if (
    !/^\d+$/.test(expiresAt) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return false;
  }

  if (Number(expiresAt) <= Date.now()) {
    return false;
  }

  try {
    const expectedSignature = createSignature(expiresAt);
    const actual = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    return (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword) {
    return false;
  }

  const actual = Buffer.from(password);
  const expected = Buffer.from(configuredPassword);

  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}