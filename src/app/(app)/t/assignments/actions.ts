"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import type { AssignmentKind } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { featuresFor } from "@/lib/features";
import { newId } from "@/lib/ids";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { getAssignment } from "@/lib/p3/exam";

const KINDS: AssignmentKind[] = ["quiz", "homework", "exam"];

export async function createAssignment(form: FormData) {
  const user = await requireUser(["teacher"]);
  const c = getClass(String(form.get("classId") ?? ""));
  if (!canManageClass(user, c)) throw new Error("class");
  const source = String(form.get("source") ?? "paper");
  const paper =
    source === "paper"
      ? db.select().from(schema.papers).where(and(eq(schema.papers.id, String(form.get("paperId") ?? "")), eq(schema.papers.ownerId, user.id))).get()
      : undefined;
  if (source === "paper" && !paper) throw new Error("paper");
  // Upload: the worksheet must be the teacher's own library upload.
  const fileId = source === "upload" ? String(form.get("fileId") ?? "") : "";
  const file = fileId
    ? db.select().from(schema.libraryItems).where(and(eq(schema.libraryItems.id, fileId), eq(schema.libraryItems.ownerId, user.id))).get()
    : undefined;
  if (source === "upload" && fileId && !file) throw new Error("file");

  const due = new Date(String(form.get("dueAt") ?? ""));
  if (Number.isNaN(due.getTime())) throw new Error("due");
  const duration = Math.max(0, Math.min(600, Math.round(Number(form.get("durationMin")) || 0)));
  const kind = KINDS.find((k) => k === form.get("kind")) ?? "quiz";
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || paper?.title || file?.title || "功課";
  const lockAi = form.get("lockAi") === "on" && featuresFor("teacher").exam_lock;
  const id = newId();
  db.insert(schema.assignments)
    .values({
      id,
      teacherId: user.id,
      classId: c.id,
      paperId: paper?.id ?? null,
      title,
      kind,
      instructions: String(form.get("instructions") ?? "").slice(0, 4000),
      fileId: file?.id ?? null,
      fileName: file?.filename ?? file?.title ?? null,
      dueAt: due,
      durationMin: duration || null,
      lockAi,
      shuffle: form.get("shuffle") === "on" && !!paper,
      allowReview: form.get("allowReview") === "on",
    })
    .run();
  audit(user, "assignment.create", `${c.name} ${c.subject} · ${title}`, lockAi ? "lockAi" : "");
  return appRedirect(`/t/assignments/${id}`);
}

function ownAssignment(user: { id: string; role: string }, id: string) {
  const a = getAssignment(id);
  if (!a || !canManageClass(user, getClass(a.classId))) throw new Error("not_found");
  return a;
}

export async function setAssignmentStatus(form: FormData) {
  const user = await requireUser(["teacher"]);
  const a = ownAssignment(user, String(form.get("id") ?? ""));
  const status = form.get("status") === "closed" ? "closed" : "active";
  db.update(schema.assignments).set({ status }).where(eq(schema.assignments.id, a.id)).run();
  if (status === "closed") audit(user, "assignment.close", a.title);
  revalidatePath(`/t/assignments/${a.id}`);
}

export async function deleteAssignment(form: FormData) {
  const user = await requireUser(["teacher"]);
  const a = ownAssignment(user, String(form.get("id") ?? ""));
  db.delete(schema.assignments).where(eq(schema.assignments.id, a.id)).run();
  audit(user, "assignment.delete", a.title);
  return appRedirect("/t/assignments");
}
