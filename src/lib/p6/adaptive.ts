import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PracticeStep } from "@/lib/db/schema";

export type Session = typeof schema.practiceSessions.$inferSelect;
export type Question = typeof schema.questions.$inferSelect;
/** What the client sees: never the answer. */
export type QuestionView = { id: string; stem: string; options: string[]; level: number; code: string };

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 3;

export function topicPool(subject: string, topic: string) {
  const q = schema.questions;
  return db
    .select()
    .from(q)
    .where(and(eq(q.scope, "school"), eq(q.type, "mc"), eq(q.subject, subject), eq(q.topic, topic)))
    .all()
    .filter((x) => x.options.length >= 2);
}

export const view = (x: Question): QuestionView => ({ id: x.id, stem: x.stem, options: x.options, level: clampLevel(x.difficulty), code: x.code });
export const clampLevel = (n: number) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(n) || 1));

/**
 * Difficulty rule: two correct answers in a row at the current level (without a hint) → one level up;
 * a wrong answer → one level down. Pure function so it is easy to reason about / test.
 */
export function nextLevel(level: number, steps: PracticeStep[]) {
  const last = steps[steps.length - 1];
  if (!last) return level;
  if (!last.correct) return clampLevel(level - 1);
  const prev = steps[steps.length - 2];
  const streak = last.correct && !last.hint && prev && prev.correct && !prev.hint && prev.level === last.level && last.level === level;
  return streak ? clampLevel(level + 1) : level;
}

/** Unseen question at the level; else the nearest level; else a repeat (never the one just answered). */
export function pickQuestion(pool: Question[], level: number, steps: PracticeStep[]): Question | undefined {
  const seen = new Set(steps.map((s) => s.qid));
  const last = steps[steps.length - 1]?.qid;
  const shuffle = <T,>(a: T[]) => a.map((x) => ({ x, r: Math.random() })).sort((p, q) => p.r - q.r).map((p) => p.x);
  const byDist = (cands: Question[]) =>
    shuffle(cands).sort((a, b) => Math.abs(clampLevel(a.difficulty) - level) - Math.abs(clampLevel(b.difficulty) - level))[0];
  return byDist(pool.filter((x) => !seen.has(x.id))) ?? byDist(pool.filter((x) => x.id !== last)) ?? pool[0];
}

/** 0–100: correct answers weighted by difficulty. */
export function masteryOf(steps: PracticeStep[]) {
  if (!steps.length) return 0;
  const got = steps.reduce((s, x) => s + (x.correct ? x.level * (x.hint ? 0.5 : 1) : 0), 0);
  return Math.round((100 * got) / (steps.length * MAX_LEVEL));
}

export function sessionStats(s: Pick<Session, "steps" | "level" | "startLevel">) {
  const correct = s.steps.filter((x) => x.correct).length;
  return { answered: s.steps.length, correct, accuracy: s.steps.length ? Math.round((100 * correct) / s.steps.length) : 0, mastery: masteryOf(s.steps), peak: Math.max(s.startLevel, ...s.steps.map((x) => x.level)) };
}

export function lastSession(studentId: string, subject: string, topic: string) {
  const p = schema.practiceSessions;
  return db.select().from(p).where(and(eq(p.studentId, studentId), eq(p.subject, subject), eq(p.topic, topic))).orderBy(desc(p.updatedAt)).get();
}

/** Start where the last run on this topic ended (the level reached), else at level 1. */
export function startLevelFor(studentId: string, subject: string, topic: string) {
  const last = lastSession(studentId, subject, topic);
  return last ? clampLevel(last.level) : MIN_LEVEL;
}

/** Per (subject, topic): latest level + mastery for the topic picker. */
export function topicProgress(studentId: string) {
  const p = schema.practiceSessions;
  const rows = db.select().from(p).where(eq(p.studentId, studentId)).orderBy(desc(p.updatedAt)).all();
  const out = new Map<string, { level: number; mastery: number; runs: number; activeId: string | null }>();
  for (const r of rows) {
    const k = `${r.subject}|${r.topic}`;
    const cur = out.get(k);
    if (!cur) out.set(k, { level: r.level, mastery: masteryOf(r.steps), runs: 1, activeId: r.status === "active" ? r.id : null });
    else {
      cur.runs++;
      if (!cur.activeId && r.status === "active") cur.activeId = r.id;
    }
  }
  return out;
}
