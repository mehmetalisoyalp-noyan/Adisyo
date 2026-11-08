// Oturum belirteci (JWT) — middleware (edge) ve sunucu tarafında ortak kullanılır.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";

export interface SessionData {
  userId: string;
  organizationId: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
  branchId: string | null;
  name: string;
}

const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET en az 32 karakter olmalı");
  return new TextEncoder().encode(s);
};

export async function signSession(data: SessionData) {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as SessionData;
  } catch {
    return null;
  }
}
