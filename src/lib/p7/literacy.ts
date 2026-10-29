import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// P7 (G5) AI-literacy six dimensions, labelled as in the tender:
// 學習目的 · 提示詞精準度 · 迭代對話 · 批判性判斷 · 戰術性學習應用 · 負責任的使用.
// Scores are an informal ESTIMATE from activity signals (no test is involved) — the UI says so.

export const LITERACY_DIMS = ["purpose", "prompt", "iterate", "critical", "tactical", "responsible"] as const;
export type LiteracyDim = (typeof LITERACY_DIMS)[number];
export type LiteracySignals = {
  convs: number; goalConvs: number; userMsgs: number; avgLen: number; attachments: number; multiTurn: number; avgTurns: number;
  feedback: number; thumbsDown: number; searchConvs: number; checkMsgs: number;
  practice: number; photo: number; redos: number; library: number; creations: number;
  safety: number; blocked: number;
};

const CHECK_RE = /點解|為甚麼|為什麼|真係|肯定|驗證|核對|來源|出處|證據|why|are you sure|source|evidence|check|verify/i;
const clamp = (n: number) => Math.max(15, Math.min(98, Math.round(n)));

export function literacySignals(userId: string): LiteracySignals {
  const c = schema.conversations;
  const convs = db.select({ id: c.id, tutorId: c.tutorId, title: c.title, tools: c.tools }).from(c).where(and(eq(c.userId, userId), eq(c.preview, false))).all();
  const ids = convs.map((x) => x.id);
  const msgs = ids.length ? db.select({ conv: schema.messages.conversationId, role: schema.messages.role, content: schema.messages.content, feedback: schema.messages.feedback }).from(schema.messages).where(inArray(schema.messages.conversationId, ids)).all() : [];
  const mine = msgs.filter((m) => m.role === "user");
  const perConv = new Map<string, number>();
  for (const m of mine) perConv.set(m.conv, (perConv.get(m.conv) ?? 0) + 1);
  const turns = [...perConv.values()];
  const count = <T,>(rows: T[]) => rows.length;
  const safety = db.select({ blocked: schema.safetyCases.blocked }).from(schema.safetyCases).where(eq(schema.safetyCases.userId, userId)).all();
  return {
    convs: convs.length,
    goalConvs: convs.filter((x) => x.tutorId || /^📷|^🔎/.test(x.title)).length,
    userMsgs: mine.length,
    avgLen: mine.length ? mine.reduce((s, m) => s + Math.min(1200, m.content.length), 0) / mine.length : 0,
    attachments: mine.filter((m) => m.content.includes("📎")).length,
    multiTurn: turns.filter((n) => n >= 3).length,
    avgTurns: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : 0,
    feedback: msgs.filter((m) => m.feedback != null).length,
    thumbsDown: msgs.filter((m) => m.feedback != null && m.feedback < 0).length,
    searchConvs: convs.filter((x) => x.tools?.search).length,
    checkMsgs: mine.filter((m) => CHECK_RE.test(m.content)).length,
    practice: count(db.select({ id: schema.practiceSessions.id }).from(schema.practiceSessions).where(eq(schema.practiceSessions.studentId, userId)).all()),
    photo: count(db.select({ id: schema.photoPractice.id }).from(schema.photoPractice).where(eq(schema.photoPractice.studentId, userId)).all()),
    redos: db.select({ n: schema.wrongItems.redoCount }).from(schema.wrongItems).where(eq(schema.wrongItems.studentId, userId)).all().reduce((s, w) => s + w.n, 0),
    library: count(db.select({ id: schema.libraryItems.id }).from(schema.libraryItems).where(eq(schema.libraryItems.ownerId, userId)).all()),
    creations: count(db.select({ id: schema.createProjects.id }).from(schema.createProjects).where(eq(schema.createProjects.ownerId, userId)).all()),
    safety: safety.length,
    blocked: safety.filter((s) => s.blocked).length,
  };
}

/** Pure scoring from signals (exported for tests / the explanation table). */
export function scoreLiteracy(s: LiteracySignals): Record<LiteracyDim, number> {
  const goalShare = s.convs ? s.goalConvs / s.convs : 0;
  const len = s.avgLen < 8 ? 0 : s.avgLen < 30 ? 10 : s.avgLen <= 400 ? 25 : 15;
  return {
    purpose: clamp(40 + goalShare * 30 + Math.min(20, (s.practice + s.photo) * 4) + (s.convs ? 5 : 0)),
    prompt: clamp(40 + (s.userMsgs ? len : 0) + Math.min(20, s.userMsgs * 1.5) + Math.min(8, s.attachments * 4)),
    iterate: clamp(40 + Math.min(35, Math.max(0, s.avgTurns - 1) * 12) + Math.min(15, s.multiTurn * 3)),
    critical: clamp(40 + Math.min(20, s.feedback * 4) + Math.min(12, s.thumbsDown * 3) + Math.min(15, s.searchConvs * 5) + Math.min(15, s.checkMsgs * 3)),
    tactical: clamp(38 + Math.min(20, s.practice * 4) + Math.min(15, s.redos * 2) + Math.min(15, s.library * 3) + Math.min(10, (s.creations + s.photo) * 3)),
    responsible: clamp(s.userMsgs || s.convs ? 90 - s.safety * 12 - s.blocked * 8 : 80 - s.safety * 12 - s.blocked * 8),
  };
}

export function aiLiteracy(userId: string): Record<LiteracyDim, number> {
  return scoreLiteracy(literacySignals(userId));
}
