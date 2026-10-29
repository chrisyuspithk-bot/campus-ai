"use server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { createLibraryItem } from "@/lib/library";
import type { Quiz } from "@/lib/studio/types";
import type { PracticeStep } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { addWrong } from "@/lib/p4/wrongbook";
import { runStructured } from "@/lib/ai/run";
import { lastSession, masteryOf, nextLevel, pickQuestion, startLevelFor, topicPool, view, type QuestionView } from "@/lib/p6/adaptive";
import { notesFor } from "@/lib/p6/topics";
import { orgCan } from "@/lib/p6/org";

/** Build a practice quiz from school-bank MC questions and open it in the Studio quiz player. */
export async function startPractice(form: FormData) {
  const user = await requireUser(["student"]);
  if (activeLockedAttempt(user.id)) return appRedirect("/s/practice");
  const subject = String(form.get("subject") ?? "");
  const topic = String(form.get("topic") ?? "");
  const count = Math.min(10, Math.max(3, Math.round(Number(form.get("count")) || 5)));
  const q = schema.questions;
  const pool = db.select().from(q).where(and(eq(q.scope, "school"), eq(q.type, "mc"), eq(q.subject, subject))).all().filter((x) => !topic || x.topic === topic);
  if (!pool.length) return appRedirect("/s/practice?none=1");
  const picked = pool.map((x) => ({ x, r: Math.random() })).sort((a, b) => a.r - b.r).slice(0, count).map((p) => p.x);
  const quiz: Quiz = { questions: picked.map((x) => ({ q: x.stem, options: x.options, answer: Number(x.answer), explain: x.topic ? `${x.code} · ${x.topic}` : x.code })) };
  const id = createLibraryItem({ ownerId: user.id, kind: "quiz", source: "studio", title: `練習：${subject}${topic ? ` · ${topic}` : ""}`, folder: "自主練習", data: quiz });
  return appRedirect(`/s/studio/quiz/${id}`);
}

// ---- P6 adaptive practice ------------------------------------------------------------------------
// Never available while an AI-locked exam is running (activeLockedAttempt), and it only draws from the
// school practice bank — exam papers are not touched.

async function practiceUser() {
  const user = await requireUser(["student"]);
  if (activeLockedAttempt(user.id)) throw new Error("exam_locked");
  if (!orgCan(user.role, "practice.adaptive")) throw new Error("forbidden");
  return user;
}

async function ownSession(id: string) {
  const user = await practiceUser();
  const s = db.select().from(schema.practiceSessions).where(and(eq(schema.practiceSessions.id, id), eq(schema.practiceSessions.studentId, user.id))).get();
  if (!s) throw new Error("not_found");
  return { user, s };
}

export async function startAdaptive(form: FormData) {
  const user = await practiceUser();
  const subject = String(form.get("subject") ?? "");
  const topic = String(form.get("topic") ?? "");
  const pool = topicPool(subject, topic);
  if (!pool.length) return appRedirect("/s/practice?none=1");
  // Resume an unfinished run on the same topic instead of starting a parallel one.
  const last = lastSession(user.id, subject, topic);
  if (last?.status === "active" && form.get("fresh") !== "1") return appRedirect(`/s/practice/session/${last.id}`);
  if (last?.status === "active") db.update(schema.practiceSessions).set({ status: "done", currentQid: null }).where(eq(schema.practiceSessions.id, last.id)).run();
  const level = startLevelFor(user.id, subject, topic);
  const first = pickQuestion(pool, level, []);
  const id = newId();
  db.insert(schema.practiceSessions).values({ id, studentId: user.id, subject, topic, level, startLevel: level, currentQid: first?.id ?? null, target: Math.min(8, Math.max(4, pool.length)) }).run();
  return appRedirect(`/s/practice/session/${id}`);
}

export type AnswerResult = {
  error?: string;
  correct?: boolean;
  answer?: number;
  explain?: string[];
  level?: number;
  change?: "up" | "down" | "same";
  done?: boolean;
  next?: QuestionView;
  answered?: number;
  mastery?: number;
};

export async function answerAdaptive(id: string, qid: string, choice: number, hinted: boolean): Promise<AnswerResult> {
  let ctx;
  try {
    ctx = await ownSession(id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { user, s } = ctx;
  if (s.status !== "active" || s.currentQid !== qid) return { error: "stale" };
  const q = db.select().from(schema.questions).where(eq(schema.questions.id, qid)).get();
  if (!q) return { error: "not_found" };
  const answer = Number(q.answer);
  const correct = choice === answer;
  const steps: PracticeStep[] = [...s.steps, { qid, level: s.level, choice, correct, hint: hinted || undefined, at: Date.now() }];
  const level = nextLevel(s.level, steps);
  const done = steps.length >= s.target;
  const next = done ? undefined : pickQuestion(topicPool(s.subject, s.topic), level, steps);
  db.update(schema.practiceSessions)
    .set({ steps, level, currentQid: next?.id ?? null, status: done || !next ? "done" : "active", updatedAt: new Date() })
    .where(eq(schema.practiceSessions.id, id))
    .run();
  if (!correct) {
    addWrong(user.id, [{ questionId: q.id, source: "practice", subject: q.subject, topic: q.topic, type: q.type, stem: q.stem, options: q.options, answer: q.answer, myAnswer: String(choice) }]);
  }
  return {
    correct,
    answer,
    explain: notesFor(q.topic).slice(0, 2),
    level,
    change: level > s.level ? "up" : level < s.level ? "down" : "same",
    done: done || !next,
    next: next ? view(next) : undefined,
    answered: steps.length,
    mastery: masteryOf(steps),
  };
}

/** "問 AI 概念": a hint about the concept, never the answer. Goes through gate() → exam lock, quota, safety. */
export async function askConcept(id: string, qid: string, question: string): Promise<{ error?: string; hint?: string; mock?: boolean }> {
  let ctx;
  try {
    ctx = await ownSession(id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { user, s } = ctx;
  const q = db.select().from(schema.questions).where(eq(schema.questions.id, qid)).get();
  if (!q || s.currentQid !== qid) return { error: "stale" };
  const ask = question.trim().slice(0, 500) || "呢題考咩概念？可以點樣諗？";
  const notes = notesFor(q.topic);
  const res = await runStructured({
    user,
    source: "practice",
    input: ask,
    refId: id,
    system: "You are a patient tutor. Explain the CONCEPT the student needs for this multiple-choice question in ≤120 words, with one similar mini-example. NEVER reveal which option is correct or compute this question's final answer. JSON: {\"hint\": string} (Markdown, $…$ for maths).",
    prompt: `Topic: ${q.subject} · ${q.topic}\nQuestion: ${q.stem}\nOptions: ${q.options.map((o, i) => `${"ABCD"[i]}. ${o}`).join("  ")}\nNotes: ${notes.join(" ")}\nStudent asks: ${ask}`,
    normalize: (raw) => {
      const h = (raw as { hint?: unknown })?.hint;
      return typeof h === "string" && h.trim() ? { hint: h.trim().slice(0, 1500) } : null;
    },
    mock: () => ({ hint: `**${q.topic || q.subject} 重點**\n\n${notes.map((n) => `- ${n}`).join("\n")}\n\n試吓用上面嘅方法自己做一次 💪` }),
  });
  if (!res.ok) return { error: res.error };
  return { hint: res.value.hint, mock: res.mock };
}

export async function endAdaptive(id: string) {
  const { s } = await ownSession(id);
  if (s.status === "active") db.update(schema.practiceSessions).set({ status: "done", currentQid: null, updatedAt: new Date() }).where(eq(schema.practiceSessions.id, id)).run();
  return appRedirect(`/s/practice/session/${id}`);
}
