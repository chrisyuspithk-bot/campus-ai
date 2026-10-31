"use server";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { setSetting } from "@/lib/settings";
import { FEATURE_KEYS } from "@/lib/features";
import { newId } from "@/lib/ids";
import { monthPrefix } from "@/lib/time";
import { isUnlocked } from "@/lib/phase";
import { audit } from "@/lib/audit";

const ROLES: Role[] = ["student", "teacher", "admin"];
const admin = () => requireUser(["admin"]);
const int = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const refreshAll = () => revalidatePath("/", "layout");

// ---- Overview --------------------------------------------------------------------------------
export async function saveSchoolSettings(form: FormData) {
  const me = await admin();
  setSetting("announcement", String(form.get("announcement") ?? "").trim().slice(0, 300));
  const name = String(form.get("schoolName") ?? "").trim();
  if (name) setSetting("schoolName", name.slice(0, 80));
  audit(me, "settings.save", name);
  refreshAll();
}

// ---- Features --------------------------------------------------------------------------------
export async function saveFeatures(form: FormData) {
  const me = await admin();
  const rows = db.select().from(schema.features).all();
  for (const r of rows) {
    if (!(FEATURE_KEYS as readonly string[]).includes(r.key) || !isUnlocked(r.phase)) continue;
    db.update(schema.features)
      .set({ studentEnabled: form.get(`${r.key}:student`) === "on", teacherEnabled: form.get(`${r.key}:teacher`) === "on" })
      .where(eq(schema.features.key, r.key))
      .run();
  }
  audit(me, "features.save");
  refreshAll(); // nav + tools change immediately for everyone
}

// ---- Models ----------------------------------------------------------------------------------
function modelFields(form: FormData) {
  return {
    displayName: String(form.get("displayName") ?? "").trim().slice(0, 40),
    openrouterId: String(form.get("openrouterId") ?? "").trim().slice(0, 120),
    description: String(form.get("description") ?? "").trim().slice(0, 120),
    roles: ROLES.filter((r) => form.get(`role:${r}`) === "on"),
    enabled: form.get("enabled") === "on",
  };
}

export async function saveModel(form: FormData) {
  const me = await admin();
  const id = String(form.get("id") ?? "");
  const f = modelFields(form);
  if (!f.displayName || !/^[\w.-]+\/[\w.:-]+$/.test(f.openrouterId)) return;
  if (id) {
    db.update(schema.models).set(f).where(eq(schema.models.id, id)).run();
  } else {
    const max = db.select({ m: sql<number>`coalesce(max(${schema.models.sortOrder}), 0)` }).from(schema.models).get();
    db.insert(schema.models).values({ id: `m-${newId().slice(0, 8)}`, ...f, sortOrder: (max?.m ?? 0) + 1 }).run();
  }
  audit(me, "models.save", `${f.displayName} (${f.openrouterId})`);
  refreshAll();
}

export async function deleteModel(form: FormData) {
  const me = await admin();
  db.delete(schema.models).where(eq(schema.models.id, String(form.get("id")))).run();
  audit(me, "models.delete", String(form.get("id")));
  refreshAll();
}

export async function saveImageModel(form: FormData) {
  const me = await admin();
  const v = String(form.get("imageModel") ?? "").trim();
  // P7: blank or "mock" = badged demo image (no image model works on this key).
  if (/^[\w.-]+\/[\w.:-]+$/.test(v) || v === "" || v === "mock") setSetting("imageModel", v === "mock" ? "" : v);
  audit(me, "models.save", `image: ${v}`);
  revalidatePath("/a/models");
}

// ---- Quotas ----------------------------------------------------------------------------------
export async function saveQuotas(form: FormData) {
  const me = await admin();
  for (const role of ROLES) {
    const values = {
      dailyTokens: int(form.get(`${role}:daily`)),
      monthlyTokens: int(form.get(`${role}:monthly`)),
      imagesPerDay: int(form.get(`${role}:images`)),
    };
    db.insert(schema.quotas).values({ role, ...values }).onConflictDoUpdate({ target: schema.quotas.role, set: values }).run();
  }
  audit(me, "quotas.save");
  refreshAll();
}

export async function addOverride(form: FormData) {
  const me = await admin();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const u = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (!u) return;
  const values = {
    dailyTokens: int(form.get("daily")),
    monthlyTokens: int(form.get("monthly")),
    imagesPerDay: int(form.get("images")),
    note: String(form.get("note") ?? "").slice(0, 100),
  };
  db.insert(schema.quotaOverrides).values({ userId: u.id, ...values }).onConflictDoUpdate({ target: schema.quotaOverrides.userId, set: values }).run();
  audit(me, "quota.override", username, `daily ${values.dailyTokens} / monthly ${values.monthlyTokens}`);
  refreshAll();
}

export async function removeOverride(form: FormData) {
  const me = await admin();
  db.delete(schema.quotaOverrides).where(eq(schema.quotaOverrides.userId, String(form.get("userId")))).run();
  audit(me, "quota.override", String(form.get("userId")), "removed");
  refreshAll();
}

// ---- Users -----------------------------------------------------------------------------------
export type UserActionState = { message?: string; error?: string };

export async function createUser(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const me = await admin();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const displayName = String(form.get("displayName") ?? "").trim();
  const role = String(form.get("role")) as Role;
  const password = String(form.get("password") ?? "");
  if (!/^[a-z0-9._-]{2,40}$/.test(username) || !displayName || !ROLES.includes(role) || password.length < 8) {
    return { error: "invalid" };
  }
  if (db.select().from(schema.users).where(eq(schema.users.username, username)).get()) return { error: "exists" };
  db.insert(schema.users)
    .values({
      id: newId(),
      username,
      displayName: displayName.slice(0, 40),
      role,
      group: String(form.get("group") ?? "").trim().slice(0, 20) || null,
      email: `${username}@school.edu.hk`,
      passwordHash: bcrypt.hashSync(password, 10),
    })
    .run();
  audit(me, "users.create", username, role);
  revalidatePath("/a/users");
  return { message: "ok" };
}

export async function importCsv(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const me = await admin();
  let text = String(form.get("csv") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) text = await file.text();
  let n = 0;
  let skip = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [username, displayName, role, group, password] = line.split(",").map((s) => s?.trim() ?? "");
    const uname = username?.toLowerCase();
    if (!uname || uname === "username" || !/^[a-z0-9._-]{2,40}$/.test(uname) || !displayName || !ROLES.includes(role as Role) || (password ?? "").length < 8) {
      skip++;
      continue;
    }
    if (db.select().from(schema.users).where(eq(schema.users.username, uname)).get()) {
      skip++;
      continue;
    }
    db.insert(schema.users)
      .values({ id: newId(), username: uname, displayName, role: role as Role, group: group || null, email: `${uname}@school.edu.hk`, passwordHash: bcrypt.hashSync(password, 10) })
      .run();
    n++;
  }
  audit(me, "users.import", "", `${n} added, ${skip} skipped`);
  revalidatePath("/a/users");
  return { message: JSON.stringify({ n, skip }) };
}

export async function batchUsers(form: FormData) {
  const me = await admin();
  const ids = form.getAll("ids").map(String).filter((id) => id !== me.id); // never lock yourself out
  const op = String(form.get("op"));
  if (!ids.length) return;
  const u = schema.users;
  if (op === "disable" || op === "enable") {
    db.update(u).set({ status: op === "disable" ? "disabled" : "active" }).where(inArray(u.id, ids)).run();
  } else if (op.startsWith("role:")) {
    const role = op.slice(5) as Role;
    // Changing role invalidates existing sessions (JWT carries role).
    if (ROLES.includes(role)) db.update(u).set({ role, tokenVersion: sql`${u.tokenVersion} + 1` }).where(inArray(u.id, ids)).run();
  } else if (op === "resetQuota") {
    db.delete(schema.usage).where(and(inArray(schema.usage.userId, ids), like(schema.usage.day, `${monthPrefix()}%`))).run();
  }
  audit(me, "users.batch", `${ids.length} users`, op);
  revalidatePath("/a/users");
}

export async function yearEnd(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  const me = await admin();
  if (String(form.get("confirm")) !== "CONFIRM") return { error: "confirm" };
  const mode = String(form.get("mode")) === "delete" ? "delete" : "archive";
  const studentIds = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "student")).all().map((r) => r.id);
  if (!studentIds.length) return { message: "0" };
  const c = schema.conversations;
  const changed =
    mode === "delete"
      ? db.delete(c).where(inArray(c.userId, studentIds)).returning({ id: c.id }).all()
      : db.update(c).set({ archived: true, pinned: false }).where(and(inArray(c.userId, studentIds), eq(c.archived, false))).returning({ id: c.id }).all();
  setSetting("yearEndPolicy", mode);
  audit(me, "users.yearEnd", mode, `${changed.length} conversations`);
  revalidatePath("/", "layout");
  return { message: String(changed.length) };
}
