// Runtime-agnostic JWT helpers (used by proxy.ts and server code).
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/db/schema";

export const SESSION_COOKIE = "campus_session";
export const SESSION_TTL_SHORT = 60 * 60 * 12; // 12h when "remember device" is off
export const SESSION_TTL_LONG = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = { sub: string; role: Role; tv: number };
/** A verified session: `jti` identifies this login (for logout revocation), `exp` is in epoch seconds. */
export type Session = SessionPayload & { jti: string; exp: number };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return new TextEncoder().encode(s || "campus-ai-dev-secret-do-not-use-in-prod");
}

export async function signSession(p: SessionPayload, ttlSeconds: number) {
  return new SignJWT({ role: p.role, tv: p.tv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    // Tokens without a jti predate logout revocation and can't be revoked, so they're rejected.
    if (!payload.sub || !payload.jti || !payload.exp || !["student", "teacher", "admin"].includes(role)) return null;
    return { sub: payload.sub, role, tv: Number(payload.tv ?? 0), jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}

export function homeFor(role: Role) {
  return role === "student" ? "/s" : role === "teacher" ? "/t" : "/a";
}
