"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { getAssignment } from "@/lib/p3/exam";
import { aiDraft, ensureGrade, gradingQueue, saveGrade, sumAi } from "@/lib/p4/grading";
import type { GradeStatus, QuestionGrade } from "@/lib/db/schema";
import { attemptPages } from "@/lib/p5/scan";
import { sanitizeInk } from "@/lib/p5/ink";
import { recognise } from "@/lib/p5/handwriting";

async function load(attemptId: string) {
  const user = await requireUser(["teacher", "admin"]);
  const att = db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId)).get();
  const a = att ? getAssignment(att.assignmentId) : undefined;
  if (!att || !a || att.status !== "submitted" || !canManageClass(user, getClass(a.classId))) throw new Error("not_found");
  return { user, att, a };
}

/** Next attempt still waiting (pending first, then in progress), preferring the same assignment. */
function nextOpen(user: { id: string; role: string }, assignmentId: string, current: string) {
  const q = gradingQueue(user).filter((r) => r.attemptId !== current && r.state !== "done");
  return (q.find((r) => r.assignmentId === assignmentId && r.state === "pending") ?? q.find((r) => r.state === "pending") ?? q[0])?.attemptId;
}

export async function saveGradeAction(form: FormData) {
  const attemptId = String(form.get("attemptId") ?? "");
  const { user, att, a } = await load(attemptId);
  const intent = String(form.get("intent") ?? "save");
  let payload: { marks?: Record<string, QuestionGrade>; comment?: string; ink?: unknown } = {};
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {}
  const g = ensureGrade(a, att);
  let marks = payload.marks ?? {};
  if (intent === "accept") marks = Object.fromEntries(Object.entries(g.marks).map(([k, m]) => [k, { ...marks[k], score: m.ai ?? 0, steps: [] }]));
  const status: GradeStatus = intent === "save" ? "in_progress" : "done";
  const ink = payload.ink !== undefined ? { ...g.ink, ...sanitizeInk(payload.ink, attemptPages(a.id, att.studentId).map((p) => p.id)) } : undefined;
  saveGrade(a, att, user.id, { marks, comment: payload.comment ?? g.comment, status, ink });
  if (status === "done") audit(user, "grade.done", a.title, attemptId);
  revalidatePath("/t/grading");
  if (status === "done") {
    const next = nextOpen(user, a.id, attemptId);
    return appRedirect(next ? `/t/grading/${next}?saved=1` : "/t/grading?state=done&saved=1");
  }
  return appRedirect(`/t/grading/${attemptId}?saved=1`);
}

export async function runAiDraftAction(form: FormData) {
  const attemptId = String(form.get("attemptId") ?? "");
  const { user, att, a } = await load(attemptId);
  const g = ensureGrade(a, att);
  const res = await aiDraft(user, a, att);
  if (!res.ok) return appRedirect(`/t/grading/${attemptId}?err=${res.error}`);
  const marks = Object.fromEntries(Object.entries(res.marks).map(([k, m]) => [k, { ...g.marks[k], ai: m.ai, aiNote: m.aiNote, aiSteps: m.aiSteps }]));
  db.update(schema.grades)
    .set({ marks, aiTotal: sumAi(marks), aiSummary: res.summary, aiMock: res.mock, status: g.status === "pending" ? "in_progress" : g.status, updatedAt: new Date() })
    .where(eq(schema.grades.attemptId, attemptId))
    .run();
  return appRedirect(`/t/grading/${attemptId}?ai=1`);
}

/** P5: read the scanned handwriting (vision model if configured, else OCR queue text) and refresh the AI draft. */
export async function recogniseAction(form: FormData) {
  const attemptId = String(form.get("attemptId") ?? "");
  const { user, att, a } = await load(attemptId);
  const pages = attemptPages(a.id, att.studentId);
  const g = ensureGrade(a, att);
  const res = await recognise(user, a, att, pages);
  if (!res.ok) return appRedirect(`/t/grading/${attemptId}?err=${res.error}`);
  const { answers, marks: draft, summary, mock } = res.value;
  db.update(schema.attempts).set({ answers }).where(eq(schema.attempts.id, attemptId)).run();
  const marks = Object.fromEntries(Object.entries(draft).map(([k, m]) => [k, { ...g.marks[k], ai: m.ai, aiNote: m.aiNote, ocr: m.ocr, aiSteps: m.aiSteps }]));
  db.update(schema.grades)
    .set({ marks, aiTotal: sumAi(marks), aiSummary: summary, aiMock: mock, status: g.status === "pending" ? "in_progress" : g.status, updatedAt: new Date() })
    .where(eq(schema.grades.attemptId, attemptId))
    .run();
  audit(user, "grade.handwriting", a.title, attemptId);
  return appRedirect(`/t/grading/${attemptId}?hw=1`);
}
