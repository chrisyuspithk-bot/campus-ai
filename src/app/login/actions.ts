"use server";
import { cookies } from "next/headers";
import { appRedirect, secureCookies } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_LONG, SESSION_TTL_SHORT, homeFor, signSession } from "@/lib/auth/session";
import { LANG_COOKIE } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";

// Compared against when the user doesn't exist so timing doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("campus-ai-dummy", 10);

export type LoginState = { error?: DictKey; username?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const remember = form.get("remember") === "on";
  const next = String(form.get("next") ?? "");
  if (!username || !password) return { error: "login.errRequired", username };

  const u = db
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.username, username.toLowerCase()), eq(schema.users.email, username.toLowerCase())))
    .get();
  // Same message for unknown user / wrong password (no account enumeration).
  const ok = u ? await bcrypt.compare(password, u.passwordHash) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
  if (!u || !ok) return { error: "login.errInvalid", username };
  if (u.status !== "active") return { error: "login.errDisabled", username };

  const ttl = remember ? SESSION_TTL_LONG : SESSION_TTL_SHORT;
  const token = await signSession({ sub: u.id, role: u.role, tv: u.tokenVersion }, ttl);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    // Session cookie unless "remember this device" is ticked.
    ...(remember ? { maxAge: ttl } : {}),
  });
  jar.set(LANG_COOKIE, u.language, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id)).run();
  db.insert(schema.events).values({ type: "login", userId: u.id }).run();
  audit({ id: u.id, displayName: u.displayName, role: u.role }, "login", u.username);

  const home = homeFor(u.role);
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && (next.startsWith(home) || next.startsWith("/ai") || next.startsWith("/me"))
      ? next
      : home;
  return appRedirect(safeNext);
}

export async function setLoginLanguage(lang: "zh-Hant" | "en") {
  (await cookies()).set(LANG_COOKIE, lang === "en" ? "en" : "zh-Hant", { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
