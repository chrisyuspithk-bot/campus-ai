"use server";
import { cookies } from "next/headers";
import { appRedirect } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { LANG_COOKIE } from "@/lib/i18n/server";
import { modelsFor } from "@/lib/models";
import { AVATARS } from "@/lib/avatars";


export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const displayName = String(form.get("displayName") ?? "").trim().slice(0, 40);
  const language = form.get("language") === "en" ? "en" : "zh-Hant";
  const avatar = String(form.get("avatar") ?? "");
  const defaultModelId = String(form.get("defaultModelId") ?? "");
  const allowed = modelsFor(user.role).map((m) => m.id);
  db.update(schema.users)
    .set({
      ...(displayName ? { displayName } : {}),
      language,
      ...(AVATARS.includes(avatar) ? { avatar } : {}),
      defaultModelId: allowed.includes(defaultModelId) ? defaultModelId : null,
    })
    .where(eq(schema.users.id, user.id))
    .run();
  (await cookies()).set(LANG_COOKIE, language, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout"); // top bar name + language update immediately
}

export type PwState = { ok?: boolean; error?: "me.passwordWrong" | "me.passwordShort" };

export async function changePassword(_prev: PwState, form: FormData): Promise<PwState> {
  const user = await requireUser();
  const oldPw = String(form.get("old") ?? "");
  const newPw = String(form.get("new") ?? "");
  if (newPw.length < 8) return { error: "me.passwordShort" };
  const row = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
  if (!row || !(await bcrypt.compare(oldPw, row.passwordHash))) return { error: "me.passwordWrong" };
  db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPw, 10) }).where(eq(schema.users.id, user.id)).run();
  return { ok: true };
}

export async function logoutAllDevices() {
  const user = await requireUser();
  db.update(schema.users)
    .set({ tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, user.id))
    .run();
  (await cookies()).delete(SESSION_COOKIE);
  await appRedirect("/login");
}
