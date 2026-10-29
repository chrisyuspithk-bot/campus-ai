"use server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AttemptAnswers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { attemptDeadline, getAssignment, settleAttempt, startAttempt, studentCanAccess, submitAttempt } from "@/lib/p3/exam";

export async function startAttemptAction(form: FormData) {
  const user = await requireUser(["student"]);
  const a = getAssignment(String(form.get("id") ?? ""));
  if (!studentCanAccess(a, user.id)) return appRedirect("/s/assignments");
  if (a.status === "closed" || a.dueAt.getTime() < Date.now()) return appRedirect(`/s/assignments/${a.id}`);
  startAttempt(a, user.id);
  return appRedirect(`/s/assignments/${a.id}/attempt`);
}

function cleanAnswers(raw: unknown): AttemptAnswers {
  if (!raw || typeof raw !== "object") return {};
  const out: AttemptAnswers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (typeof v === "string" && k.length <= 40) out[k] = v.slice(0, 20_000);
  }
  return out;
}

function ownAttempt(userId: string, attemptId: string) {
  const att = db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId)).get();
  if (!att || att.studentId !== userId) return null;
  const a = getAssignment(att.assignmentId)!;
  return { att: settleAttempt(att, a), a };
}

export type SaveResult = { ok: true; savedAt: number } | { ok: false; closed: boolean };

/** Autosave (debounced from the exam page). Ignored once the attempt is closed or time is up. */
export async function saveAttemptAction(attemptId: string, answers: unknown, blurCount: number): Promise<SaveResult> {
  const user = await requireUser(["student"]);
  const r = ownAttempt(user.id, attemptId);
  if (!r) return { ok: false, closed: true };
  if (r.att.status !== "in_progress" || Date.now() > attemptDeadline(r.a, r.att) + 5_000) return { ok: false, closed: true };
  const savedAt = new Date();
  db.update(schema.attempts)
    .set({ answers: cleanAnswers(answers), blurCount: Math.max(r.att.blurCount, Math.min(999, Math.floor(blurCount) || 0)), savedAt })
    .where(eq(schema.attempts.id, attemptId))
    .run();
  return { ok: true, savedAt: savedAt.getTime() };
}

/** Hand in: final save (if still in time) then auto-mark. Returns where to go next. */
export async function submitAttemptAction(attemptId: string, answers: unknown, blurCount: number, auto: boolean): Promise<{ next: string }> {
  const user = await requireUser(["student"]);
  const r = ownAttempt(user.id, attemptId);
  if (!r) return { next: "/s/assignments" };
  if (r.att.status === "in_progress") {
    // A small grace window lets the client's own time-up submit land.
    const inTime = Date.now() <= attemptDeadline(r.a, r.att) + 15_000;
    const att = inTime
      ? { ...r.att, answers: cleanAnswers(answers), blurCount: Math.max(r.att.blurCount, Math.floor(blurCount) || 0) }
      : r.att;
    if (inTime) db.update(schema.attempts).set({ answers: att.answers, blurCount: att.blurCount, savedAt: new Date() }).where(eq(schema.attempts.id, attemptId)).run();
    submitAttempt(att, r.a, auto);
  }
  return { next: r.a.allowReview ? `/s/assignments/${r.a.id}/result` : `/s/assignments/${r.a.id}` };
}
