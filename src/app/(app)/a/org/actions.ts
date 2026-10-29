"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { PERM_ROLES, PERMS, savePermMatrix, type PermMatrix } from "@/lib/p6/org";

export async function createClass(form: FormData) {
  const user = await requireUser(["admin"]);
  const name = String(form.get("name") ?? "").trim().slice(0, 20);
  const subject = String(form.get("subject") ?? "").trim().slice(0, 20);
  if (!name || !subject) return;
  const teacherId = String(form.get("teacherId") ?? "");
  const teacher = teacherId ? db.select().from(schema.users).where(and(eq(schema.users.id, teacherId), eq(schema.users.role, "teacher"))).get() : undefined;
  const id = newId();
  db.insert(schema.classes).values({ id, name, subject, level: String(form.get("level") ?? "").slice(0, 4), teacherId: teacher?.id ?? null }).run();
  if (form.get("addGroup") === "on") {
    const students = db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "student"), eq(schema.users.group, name), eq(schema.users.status, "active"))).all();
    for (const s of students) db.insert(schema.classMembers).values({ classId: id, userId: s.id }).onConflictDoNothing().run();
  }
  audit(user, "class.create", `${name} ${subject}`, teacher?.displayName ?? "");
  revalidatePath("/a/org");
}

/** P6 permission matrix (capability × role). Admin always keeps every capability. */
export async function savePermissions(form: FormData) {
  const user = await requireUser(["admin"]);
  const m = {} as PermMatrix;
  for (const p of PERMS) m[p] = ["admin", ...PERM_ROLES[p].filter((r) => form.get(`${p}:${r}`) === "on")];
  savePermMatrix(m);
  audit(user, "org.permissions", "matrix", PERMS.map((p) => `${p}=${m[p].join("/")}`).join(" "));
  revalidatePath("/a/org");
}
