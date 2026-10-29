"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { findAttempt, getAssignment, settleAttempt, studentCanAccess } from "@/lib/p3/exam";
import { addWrong, recordRedo, wrongQuestions } from "@/lib/p4/wrongbook";

/** [錯題入簿] on the result page: all lost-mark questions, or one (`qid`). */
export async function addWrongFromResult(form: FormData) {
  const user = await requireUser(["student"]);
  const a = getAssignment(String(form.get("id") ?? ""));
  if (!studentCanAccess(a, user.id)) return appRedirect("/s/assignments");
  const found = findAttempt(a.id, user.id);
  if (!found) return appRedirect(`/s/assignments/${a.id}`);
  const att = settleAttempt(found, a);
  const qid = String(form.get("qid") ?? "");
  const items = wrongQuestions(a, att).filter((w) => !qid || w.questionId === qid);
  const n = addWrong(user.id, items);
  revalidatePath("/s/wrongbook");
  return appRedirect(`/s/assignments/${a.id}/result?added=${n}`);
}

export async function redoAction(id: string, correct: boolean) {
  const user = await requireUser(["student"]);
  recordRedo(user.id, id, correct);
  revalidatePath("/s/wrongbook");
  revalidatePath("/s/progress");
}

export async function removeWrong(form: FormData) {
  const user = await requireUser(["student"]);
  db.delete(schema.wrongItems).where(and(eq(schema.wrongItems.id, String(form.get("id") ?? "")), eq(schema.wrongItems.studentId, user.id))).run();
  revalidatePath("/s/wrongbook");
}
