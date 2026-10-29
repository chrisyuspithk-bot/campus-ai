import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { appRedirect } from "@/lib/app-url";
import { SESSION_COOKIE, homeFor, verifySession } from "./session";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  group: string | null;
  language: "zh-Hant" | "en";
  avatar: string;
  defaultModelId: string | null;
};

/** Returns the signed-in, active user or null. Deduped per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  if (db.select().from(schema.revokedSessions).where(eq(schema.revokedSessions.jti, session.jti)).get()) return null;
  const u = db.select().from(schema.users).where(eq(schema.users.id, session.sub)).get();
  if (!u || u.status !== "active" || u.tokenVersion !== session.tv || u.role !== session.role) {
    return null;
  }
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    group: u.group,
    language: u.language,
    avatar: u.avatar,
    defaultModelId: u.defaultModelId,
  };
});

/** For pages/layouts/actions. Invalid sessions are cleared via the logout route to avoid redirect loops with proxy. */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return appRedirect("/api/auth/logout?reason=expired");
  if (roles && !roles.includes(user.role)) return appRedirect(homeFor(user.role));
  return user;
}

/** For route handlers: returns user or a 401/403 Response. */
export async function requireApiUser(roles?: Role[]): Promise<CurrentUser | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (roles && !roles.includes(user.role)) return Response.json({ error: "forbidden" }, { status: 403 });
  return user;
}
