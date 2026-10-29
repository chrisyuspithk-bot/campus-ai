import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { quotaStatus } from "@/lib/quota";
import { lastNDays } from "@/lib/time";
import { listClassesFor, memberIds } from "./classes";

export type AlertKind = "engagement" | "quota" | "safety" | "lowscore";
export type StudentAlert = {
  key: string;
  kind: AlertKind;
  studentId: string;
  studentName: string;
  avatar: string;
  className: string;
  /** Interpolation values for the `al.detail.<kind>` string */
  vars: Record<string, string | number>;
  level: "high" | "medium" | "low";
  at: Date;
};

/**
 * Students who need attention, computed from live data (usage, quota, risk cases, attempts).
 * Safety alerts only carry level + count — the excerpt stays with admins (/a/safety).
 */
export function computeAlerts(teacherId: string): StudentAlert[] {
  const classes = listClassesFor(teacherId);
  const seen = new Map<string, string>(); // studentId → class name (first class wins)
  for (const c of classes) for (const id of memberIds(c.id)) if (!seen.has(id)) seen.set(id, `${c.name} ${c.subject}`);
  const ids = [...seen.keys()];
  if (!ids.length) return [];
  const users = db.select().from(schema.users).where(inArray(schema.users.id, ids)).all();
  const week = lastNDays(7);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const dismissed = new Set(
    db.select({ key: schema.alertDismissals.key }).from(schema.alertDismissals).where(eq(schema.alertDismissals.teacherId, teacherId)).all().map((r) => r.key),
  );
  const out: StudentAlert[] = [];

  for (const u of users) {
    const base = { studentId: u.id, studentName: u.displayName, avatar: u.avatar, className: seen.get(u.id)! };
    const push = (a: Omit<StudentAlert, keyof typeof base | "key"> & { keySuffix: string }) => {
      const key = `${a.kind}:${u.id}:${a.keySuffix}`;
      if (!dismissed.has(key)) out.push({ ...base, key, kind: a.kind, vars: a.vars, level: a.level, at: a.at });
    };

    // Low engagement: almost no AI/learning activity this week and nothing started.
    const usage = db.select().from(schema.usage).where(and(eq(schema.usage.userId, u.id), gte(schema.usage.day, week[0]))).all();
    const requests = usage.reduce((s, r) => s + r.requests, 0);
    const recentAttempts = db.select().from(schema.attempts).where(and(eq(schema.attempts.studentId, u.id), gte(schema.attempts.startedAt, weekAgo))).all();
    if (requests < 5 && recentAttempts.length === 0) {
      push({ kind: "engagement", keySuffix: week[0], vars: { n: requests }, level: requests === 0 ? "medium" : "low", at: new Date() });
    }

    // Quota: today's usage near / over the limit.
    const q = quotaStatus(u.id, "student");
    if (q.percent >= 80) push({ kind: "quota", keySuffix: week[6], vars: { pct: q.percent }, level: q.exhausted ? "medium" : "low", at: new Date() });

    // Safety: open risk cases (count + highest level only).
    const cases = db.select().from(schema.safetyCases).where(and(eq(schema.safetyCases.userId, u.id), eq(schema.safetyCases.status, "open"))).all();
    if (cases.length) {
      const level = cases.some((c) => c.level === "high") ? "high" : cases.some((c) => c.level === "medium") ? "medium" : "low";
      const latest = cases.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), cases[0].createdAt);
      push({ kind: "safety", keySuffix: String(latest.getTime()), vars: { n: cases.length }, level, at: latest });
    }

    // Consecutive low scores: last two marked attempts both under 50 %.
    const marked = db
      .select()
      .from(schema.attempts)
      .where(and(eq(schema.attempts.studentId, u.id), eq(schema.attempts.status, "submitted")))
      .orderBy(desc(schema.attempts.submittedAt))
      .all()
      .filter((a) => a.maxScore)
      .slice(0, 2);
    if (marked.length === 2 && marked.every((a) => (a.score ?? 0) / (a.maxScore || 1) < 0.5)) {
      const pcts = marked.map((a) => Math.round(((a.score ?? 0) / (a.maxScore || 1)) * 100));
      push({ kind: "lowscore", keySuffix: marked[0].id, vars: { a: pcts[1], b: pcts[0] }, level: "medium", at: marked[0].submittedAt ?? new Date() });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level] || b.at.getTime() - a.at.getTime());
}
