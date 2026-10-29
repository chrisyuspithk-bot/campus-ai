"use server";
import fs from "node:fs";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { getAssignment } from "@/lib/p3/exam";
import {
  assignPage, batchRoster, canManageBatch, createBatch, deletePage, getBatch, inferByOrder, scanDir, setBatchStatus, startOcr, tickOcr,
} from "@/lib/p5/scan";

async function loadBatch(batchId: string) {
  const user = await requireUser(["teacher", "admin"]);
  const b = getBatch(batchId);
  if (!canManageBatch(user, b)) throw new Error("not_found");
  return { user, b };
}

function checkAssignment(user: { id: string; role: string }, assignmentId: string) {
  if (!assignmentId) return null;
  const a = getAssignment(assignmentId);
  return a && a.paperId && canManageClass(user, getClass(a.classId)) ? a.id : null;
}

export async function createBatchAction(form: FormData) {
  const user = await requireUser(["teacher", "admin"]);
  const assignmentId = checkAssignment(user, String(form.get("assignmentId") ?? ""));
  const id = createBatch(user.id, { title: String(form.get("title") ?? "").trim(), assignmentId, pagesPerStudent: Number(form.get("pagesPerStudent")) || 2 });
  audit(user, "scan.create", String(form.get("title") ?? ""), id);
  return appRedirect(`/t/scan/${id}`);
}

export async function linkAssignmentAction(form: FormData) {
  const { user, b } = await loadBatch(String(form.get("batchId") ?? ""));
  const assignmentId = checkAssignment(user, String(form.get("assignmentId") ?? ""));
  const pps = Math.max(1, Math.min(8, Number(form.get("pagesPerStudent")) || b.pagesPerStudent));
  db.update(schema.scanBatches).set({ assignmentId, pagesPerStudent: pps, updatedAt: new Date() }).where(eq(schema.scanBatches.id, b.id)).run();
  return appRedirect(`/t/scan/${b.id}?saved=1`);
}

export async function finishUploadAction(form: FormData) {
  const { b } = await loadBatch(String(form.get("batchId") ?? ""));
  if (b.status === "uploading") setBatchStatus(b.id, "matching");
  return appRedirect(`/t/scan/${b.id}`);
}

/** Drag-and-drop / menu remap. studentId "" = unassign. */
export async function assignPageAction(batchId: string, pageId: string, studentId: string, pageNo: number) {
  const { b } = await loadBatch(batchId);
  const page = db.select().from(schema.scanPages).where(eq(schema.scanPages.id, pageId)).get();
  if (!page || page.batchId !== b.id) throw new Error("not_found");
  if (studentId && !batchRoster(b).some((r) => r.id === studentId)) throw new Error("not_in_class");
  assignPage(pageId, studentId || null, pageNo);
  if (b.status === "uploading") setBatchStatus(b.id, "matching");
  revalidatePath(`/t/scan/${b.id}`);
}

export async function orderFillAction(form: FormData) {
  const { b } = await loadBatch(String(form.get("batchId") ?? ""));
  const n = inferByOrder(b);
  return appRedirect(`/t/scan/${b.id}?order=${n}`);
}

export async function deletePageAction(form: FormData) {
  const { b } = await loadBatch(String(form.get("batchId") ?? ""));
  const page = db.select().from(schema.scanPages).where(eq(schema.scanPages.id, String(form.get("pageId") ?? ""))).get();
  if (page && page.batchId === b.id) deletePage(page);
  return appRedirect(`/t/scan/${b.id}`);
}

export async function enqueueOcrAction(form: FormData) {
  const { user, b } = await loadBatch(String(form.get("batchId") ?? ""));
  startOcr(b);
  audit(user, "scan.ocr", b.title, b.id);
  return appRedirect(`/t/scan/${b.id}`);
}

/** Polled by the progress bar while the (demo) OCR queue runs. */
export async function tickOcrAction(batchId: string) {
  const { b } = await loadBatch(batchId);
  const r = tickOcr(b);
  if (r.status === "ready") revalidatePath("/t/grading");
  return r;
}

export async function deleteBatchAction(form: FormData) {
  const { user, b } = await loadBatch(String(form.get("batchId") ?? ""));
  db.delete(schema.scanBatches).where(eq(schema.scanBatches.id, b.id)).run();
  fs.rmSync(scanDir(b.id), { recursive: true, force: true });
  audit(user, "scan.delete", b.title, b.id);
  return appRedirect("/t/scan");
}
