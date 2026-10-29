import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { dayKey, lastNDays } from "@/lib/time";
import { listMembers, memberIds } from "@/lib/p3/classes";
import { settleAttempt } from "@/lib/p3/exam";
import { gradeQuestions, studentMarks } from "./grading";

export const WEEK = () => new Date(Date.now() - 7 * 86_400_000);

/** Days with any learning activity: AI requests, chat messages, submissions, practice quizzes, wrongbook redos. */
export function activeDays(userId: string) {
  const days = new Set<string>();
  for (const u of db.select().from(schema.usage).where(eq(schema.usage.userId, userId)).all()) if (u.requests > 0) days.add(u.day);
  const msgs = db
    .select({ at: schema.messages.createdAt })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.conversations.userId, userId), eq(schema.messages.role, "user")))
    .all();
  for (const m of msgs) days.add(dayKey(m.at));
  for (const a of db.select({ at: schema.attempts.submittedAt }).from(schema.attempts).where(eq(schema.attempts.studentId, userId)).all()) if (a.at) days.add(dayKey(a.at));
  for (const l of db.select({ at: schema.libraryItems.createdAt }).from(schema.libraryItems).where(eq(schema.libraryItems.ownerId, userId)).all()) days.add(dayKey(l.at));
  for (const w of db.select({ at: schema.wrongItems.lastRedoAt }).from(schema.wrongItems).where(eq(schema.wrongItems.studentId, userId)).all()) if (w.at) days.add(dayKey(w.at));
  return days;
}

/** Consecutive active days ending today (or yesterday, so the streak isn't lost before today's first activity). */
export function streakOf(days: Set<string>) {
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function weeklyChats(userId: string) {
  return db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.conversations.userId, userId), eq(schema.messages.role, "user"), gte(schema.messages.createdAt, WEEK())))
    .all().length;
}

/** Practice = self-practice / studio quizzes + wrongbook redos in the last 7 days. */
export function weeklyPractice(userId: string) {
  const quizzes = db
    .select({ id: schema.libraryItems.id })
    .from(schema.libraryItems)
    .where(and(eq(schema.libraryItems.ownerId, userId), eq(schema.libraryItems.kind, "quiz"), gte(schema.libraryItems.createdAt, WEEK())))
    .all().length;
  const redos = db.select({ id: schema.wrongItems.id }).from(schema.wrongItems).where(and(eq(schema.wrongItems.studentId, userId), gte(schema.wrongItems.lastRedoAt, WEEK()))).all().length;
  return quizzes + redos;
}

export type TopicStat = { subject: string; topic: string; pct: number; got: number; max: number };

/** Accuracy per subject/topic across released marks of all submitted paper attempts. */
export function topicStats(userId: string): TopicStat[] {
  const rows = db
    .select({ att: schema.attempts, a: schema.assignments, subject: schema.classes.subject })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(and(eq(schema.attempts.studentId, userId), eq(schema.attempts.status, "submitted")))
    .all();
  const acc = new Map<string, TopicStat>();
  for (const { att, a, subject } of rows) {
    if (!a.paperId) continue;
    const { marks } = studentMarks(a, att);
    for (const q of gradeQuestions(a)) {
      const s = marks[q.id]?.score;
      if (s == null) continue;
      const key = `${q.subject || subject}|${q.topic}`;
      const cur = acc.get(key) ?? { subject: q.subject || subject, topic: q.topic || "—", pct: 0, got: 0, max: 0 };
      cur.got += s;
      cur.max += q.marks;
      acc.set(key, cur);
    }
  }
  return [...acc.values()].map((x) => ({ ...x, pct: x.max ? Math.round((x.got / x.max) * 100) : 0 })).sort((x, y) => x.subject.localeCompare(y.subject) || x.topic.localeCompare(y.topic));
}

// P7: the six AI-literacy dimensions moved to src/lib/p7/literacy.ts (tender labels, activity-based estimate).
export { aiLiteracy, LITERACY_DIMS, type LiteracyDim } from "@/lib/p7/literacy";

/** Average % over a student's submitted, marked attempts. */
export function avgScore(userId: string) {
  const atts = db.select().from(schema.attempts).where(and(eq(schema.attempts.studentId, userId), eq(schema.attempts.status, "submitted"), eq(schema.attempts.needsMarking, false))).all().filter((a) => a.maxScore);
  return atts.length ? Math.round((atts.reduce((s, a) => s + (a.score ?? 0) / a.maxScore!, 0) / atts.length) * 100) : null;
}

/** Activity count per day for the last n days (chat messages + submissions + practice). */
export function dailyActivity(userId: string, n = 7) {
  const keys = lastNDays(n);
  const counts = new Map(keys.map((k) => [k, 0]));
  const since = new Date(Date.now() - n * 86_400_000);
  const bump = (d: Date | null) => {
    if (!d) return;
    const k = dayKey(d);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  };
  db.select({ at: schema.messages.createdAt })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.conversations.userId, userId), eq(schema.messages.role, "user"), gte(schema.messages.createdAt, since)))
    .all()
    .forEach((m) => bump(m.at));
  db.select({ at: schema.attempts.submittedAt }).from(schema.attempts).where(eq(schema.attempts.studentId, userId)).all().forEach((a) => bump(a.at));
  db.select({ at: schema.libraryItems.createdAt }).from(schema.libraryItems).where(eq(schema.libraryItems.ownerId, userId)).all().forEach((l) => bump(l.at));
  db.select({ at: schema.wrongItems.lastRedoAt }).from(schema.wrongItems).where(eq(schema.wrongItems.studentId, userId)).all().forEach((w) => bump(w.at));
  return keys.map((day) => ({ day, tokens: counts.get(day)! }));
}

export function tokens7d(userIds: string[]) {
  const days = lastNDays(7);
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  for (const u of db.select().from(schema.usage).where(and(inArray(schema.usage.userId, userIds), inArray(schema.usage.day, days))).all()) out.set(u.userId, (out.get(u.userId) ?? 0) + u.tokens);
  return out;
}

/** One row per class member for /t/reports and the CSV export. */
export function classReport(classId: string) {
  const members = listMembers(classId);
  const assignments = db.select().from(schema.assignments).where(eq(schema.assignments.classId, classId)).all();
  const atts = assignments.length
    ? db.select().from(schema.attempts).where(inArray(schema.attempts.assignmentId, assignments.map((a) => a.id))).all()
    : [];
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const tok = tokens7d(members.map((m) => m.id));
  const wrong = members.length ? db.select().from(schema.wrongItems).where(inArray(schema.wrongItems.studentId, members.map((m) => m.id))).all() : [];
  return members.map((m) => {
    const mine = atts.filter((x) => x.studentId === m.id).map((x) => settleAttempt(x, byId.get(x.assignmentId)!));
    const submitted = mine.filter((x) => x.status === "submitted");
    const marked = submitted.filter((x) => !x.needsMarking && x.maxScore);
    const avg = marked.length ? Math.round((marked.reduce((s, x) => s + (x.score ?? 0) / x.maxScore!, 0) / marked.length) * 100) : null;
    const scores = Object.fromEntries(assignments.map((a) => {
      const x = submitted.find((s) => s.assignmentId === a.id);
      return [a.id, !x ? (a.dueAt.getTime() < Date.now() ? "missed" : "") : x.needsMarking ? "pending" : x.maxScore ? `${x.score ?? 0}/${x.maxScore}` : "✓"];
    }));
    return {
      ...m,
      submitted: submitted.length,
      total: assignments.length,
      avg,
      tokens7d: tok.get(m.id) ?? 0,
      chats7d: weeklyChats(m.id),
      wrongOpen: wrong.filter((w) => w.studentId === m.id && !w.mastered).length,
      streak: streakOf(activeDays(m.id)),
      scores,
    };
  });
}

export function classAssignments(classId: string) {
  return db.select().from(schema.assignments).where(eq(schema.assignments.classId, classId)).all().sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export function classAverage(classId: string) {
  const ids = memberIds(classId);
  const avgs = ids.map(avgScore).filter((x): x is number => x != null);
  return avgs.length ? Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length) : null;
}
