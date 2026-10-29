import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { GradeStatus, InkItem, QuestionGrade, QuestionType, StepMark } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/dal";
import { runStructured } from "@/lib/ai/run";
import { fileKey, paperQuestions, UPLOAD_QID, type Assignment, type Attempt } from "@/lib/p3/exam";
import { checkAnswer, normAnswer } from "./answer";
import { ruleSteps, sanitizeSteps, schemeSteps, stepsTotal, STEPS_PROMPT } from "@/lib/p7/steps";

export type Grade = typeof schema.grades.$inferSelect;

/** A markable item. Upload homework without a paper is one pseudo-question out of 10. */
export type GradeQuestion = {
  id: string;
  section: string;
  type: QuestionType;
  stem: string;
  options: string[];
  answer: string;
  marks: number;
  topic: string;
  subject: string;
};

export const UPLOAD_MARKS = 10;

/** Concept-defect tags and comment templates offered in the workbench (數學 demo set). */
export const DEFECT_TAGS = ["十字相乘符號錯", "未抽盡公因式", "計算失誤", "步驟不完整", "單位／答句遺漏", "概念混淆", "審題錯誤"];
export const COMMENT_TEMPLATES = [
  "步驟清晰，做得好！繼續保持。",
  "概念正確，但要小心計算同符號，交卷前再檢查一次。",
  "請重溫十字相乘：先搵相乘等於常數項、相加等於一次項系數嘅兩個數。",
  "長答題要寫齊步驟同答句，唔好只寫答案。",
  "錯題已標示，請加入錯題簿並喺本週內重做。",
];

export function gradeQuestions(a: Assignment): GradeQuestion[] {
  if (!a.paperId) {
    return [{ id: UPLOAD_QID, section: "", type: "upload", stem: a.instructions || a.title, options: [], answer: "", marks: UPLOAD_MARKS, topic: "", subject: "" }];
  }
  return paperQuestions(a.paperId).map((q) => ({ id: q.id, section: q.section, type: q.type, stem: q.stem, options: q.options, answer: q.answer, marks: q.marks, topic: q.topic, subject: q.subject }));
}

export function getGrade(attemptId: string) {
  return db.select().from(schema.grades).where(eq(schema.grades.attemptId, attemptId)).get();
}

/** Key fragments of a model answer, e.g. "(x+2)(x+3)", "x+3", "40" — used by the rule-based draft. */
function fragments(answer: string) {
  return [...new Set(answer.replace(/\[\d+\]/g, "").split(/[；;，,。、\n]|\s+|[（）]/).map((f) => normAnswer(f.replace(/^\([a-z]\)/i, ""))).filter((f) => f.length >= 2 || /\d/.test(f)))];
}

/** Rule-based first pass for long/upload answers: coverage of the model answer's key fragments. */
function heuristicScore(q: GradeQuestion, text: string, hasFile: boolean): { ai: number; aiNote: string } {
  const t = normAnswer(text);
  if (!t && !hasFile) return { ai: 0, aiNote: "未作答" };
  if (!t && hasFile) return { ai: Math.round(q.marks * 0.6), aiNote: "只有相片作答：請用手寫辨識，暫按完成度估分" };
  const frags = fragments(q.answer);
  const hit = frags.filter((f) => t.includes(f)).length;
  const coverage = frags.length ? hit / frags.length : 0.5;
  const ai = Math.min(q.marks, Math.round(q.marks * Math.min(1, 0.25 + coverage * 0.85)));
  const missing = frags.filter((f) => !t.includes(f)).slice(0, 3);
  return { ai, aiNote: `涵蓋參考答案要點 ${hit}/${frags.length || "?"}${missing.length ? `；未見：${missing.join("、")}` : ""}` };
}

/**
 * P7: rule-based step breakdown for long/upload items. With a "[n]"-marked scheme the steps drive the draft score;
 * otherwise a single step carries the heuristic estimate.
 */
function withRuleSteps(q: GradeQuestion, text: string, h: { ai: number; aiNote: string }): QuestionGrade {
  const structured = schemeSteps(q.answer, q.marks).length > 1;
  if (structured && text.trim()) {
    const aiSteps = ruleSteps(q.answer, q.marks, text);
    return { ai: stepsTotal(aiSteps, q.marks), aiNote: h.aiNote, aiSteps };
  }
  return { ...h, aiSteps: [{ label: schemeSteps(q.answer, q.marks)[0].label, marksMax: q.marks, marksAwarded: h.ai, ok: h.ai === q.marks, note: h.aiNote.slice(0, 200) }] };
}

/** Draft marks for every question: MC/short are auto-marked, long/upload get the rule-based estimate. */
export function draftMarks(a: Assignment, att: Pick<Attempt, "answers">): Record<string, QuestionGrade> {
  const out: Record<string, QuestionGrade> = {};
  for (const q of gradeQuestions(a)) {
    const ans = att.answers[q.id] ?? "";
    const ok = checkAnswer(q.type, q.answer, ans);
    if (ok !== null) out[q.id] = { ai: ok ? q.marks : 0, aiNote: ok ? "自動評分：正確" : "自動評分：錯誤" };
    else out[q.id] = withRuleSteps(q, ans, heuristicScore(q, ans, !!att.answers[fileKey(q.id)]));
  }
  return out;
}

export function sumAi(marks: Record<string, QuestionGrade>) {
  return Object.values(marks).reduce((s, m) => s + (m.ai ?? 0), 0);
}

/** Final per-question score: teacher score, else AI draft. */
export function finalScore(m: QuestionGrade | undefined) {
  return m?.score ?? m?.ai ?? 0;
}

export function maxOf(a: Assignment) {
  return gradeQuestions(a).reduce((s, q) => s + q.marks, 0);
}

/** Grade row for an attempt, created with the rule-based draft the first time the workbench opens it. */
export function ensureGrade(a: Assignment, att: Attempt): Grade {
  const existing = getGrade(att.id);
  if (existing) return existing;
  const marks = draftMarks(a, att);
  const status: GradeStatus = att.needsMarking ? "pending" : "done";
  db.insert(schema.grades).values({ attemptId: att.id, status, marks, aiTotal: sumAi(marks), aiSummary: "規則初評（示範）", aiMock: true }).onConflictDoNothing().run();
  return getGrade(att.id)!;
}

/** Ask the model for a first-pass score on long/upload answers (falls back to the rule-based draft). */
export async function aiDraft(user: CurrentUser, a: Assignment, att: Attempt) {
  const qs = gradeQuestions(a).filter((q) => q.type === "long" || q.type === "upload");
  const base = draftMarks(a, att);
  if (!qs.length) return { ok: true as const, marks: base, summary: "全部為選擇／短答題，已自動評分。", mock: true };
  const items = qs.map((q) => ({ id: q.id, marks: q.marks, question: q.stem, reference: q.answer, scheme: schemeSteps(q.answer, q.marks).map(({ label, marksMax }) => ({ label, marksMax })), student: att.answers[q.id] ?? "", photo: !!att.answers[fileKey(q.id)] }));
  const input = items.map((i) => i.student).join("\n");
  const res = await runStructured({
    user,
    source: "grading",
    input,
    refId: att.id,
    system: [
      "You are a Hong Kong secondary-school teacher giving a FIRST-PASS score for long answers against a reference answer / marking scheme.",
      'JSON shape: {"items":[{"id":string,"score":number,"note":string,"steps":[...]}],"summary":string}.',
      "score is an integer from 0 to the item's marks. note: one short sentence naming what is right and the concept gap, in Traditional Chinese (Hong Kong written style).",
      STEPS_PROMPT,
      "If only a photo was uploaded (student text empty, photo true) you cannot see it: give a cautious mid score and say so.",
    ].join("\n"),
    prompt: JSON.stringify(items),
    normalize: (raw) => {
      const o = raw as { items?: { id?: unknown; score?: unknown; note?: unknown }[]; summary?: unknown };
      if (!Array.isArray(o?.items)) return null;
      const marks = { ...base };
      for (const it of o.items as { id?: unknown; score?: unknown; note?: unknown; steps?: unknown }[]) {
        const q = qs.find((x) => x.id === it.id);
        if (!q) continue;
        const n = Math.round(Number(it.score));
        const aiSteps = sanitizeSteps(it.steps, q.marks) ?? base[q.id]?.aiSteps;
        const ai = it.steps && aiSteps ? stepsTotal(aiSteps, q.marks) : Number.isFinite(n) ? Math.max(0, Math.min(q.marks, n)) : base[q.id]?.ai;
        marks[q.id] = { ai, aiNote: typeof it.note === "string" ? it.note.slice(0, 300) : "", aiSteps };
      }
      return { marks, summary: typeof o.summary === "string" ? o.summary.slice(0, 600) : "" };
    },
    mock: () => ({ marks: base, summary: "（示範模式）以參考答案要點覆蓋率估算長答分數。" }),
  });
  if (!res.ok) return { ok: false as const, error: res.error };
  return { ok: true as const, marks: res.value.marks, summary: res.value.summary, mock: res.mock };
}

/** Write teacher marks; when done, write the total back to the attempt so students see it. */
export function saveGrade(a: Assignment, att: Attempt, teacherId: string, input: { marks: Record<string, QuestionGrade>; comment: string; status: GradeStatus; ink?: Record<string, InkItem[]> }) {
  const g = ensureGrade(a, att);
  const marks: Record<string, QuestionGrade> = {};
  for (const q of gradeQuestions(a)) {
    const prev = g.marks[q.id] ?? {};
    const next = input.marks[q.id] ?? {};
    // P7: teacher-edited steps (long/upload only); a typed question score still wins over the step sum.
    const steps = q.type === "long" || q.type === "upload" ? (next.steps !== undefined ? sanitizeSteps(next.steps, q.marks) : prev.steps) : undefined;
    const typed = next.score === undefined || Number.isNaN(next.score) ? undefined : Math.max(0, Math.min(q.marks, Math.round(next.score)));
    const score = typed ?? (next.steps !== undefined && steps ? stepsTotal(steps, q.marks) : prev.score);
    marks[q.id] = { ...prev, ...next, steps, score };
    if (!steps) delete marks[q.id].steps;
  }
  const done = input.status === "done";
  if (done) for (const q of gradeQuestions(a)) if (marks[q.id].score === undefined) marks[q.id].score = marks[q.id].steps ? stepsTotal(marks[q.id].steps!, q.marks) : (marks[q.id].ai ?? 0);
  db.update(schema.grades)
    .set({ marks, comment: input.comment.slice(0, 2000), status: input.status, ...(input.ink ? { ink: input.ink } : {}), gradedBy: teacherId, gradedAt: done ? new Date() : g.gradedAt, updatedAt: new Date() })
    .where(eq(schema.grades.attemptId, att.id))
    .run();
  if (done) {
    const total = gradeQuestions(a).reduce((s, q) => s + finalScore(marks[q.id]), 0);
    db.update(schema.attempts).set({ score: total, maxScore: maxOf(a), needsMarking: false }).where(eq(schema.attempts.id, att.id)).run();
  } else {
    db.update(schema.attempts).set({ needsMarking: true }).where(eq(schema.attempts.id, att.id)).run();
  }
}

export type QueueRow = {
  attemptId: string;
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  student: { id: string; displayName: string; username: string; avatar: string };
  submittedAt: Date | null;
  state: GradeStatus;
  auto: boolean;
  aiPct: number | null;
  scorePct: number | null;
};

/** Submitted attempts in the teacher's classes (all classes for admins), newest first. */
export function gradingQueue(user: { id: string; role: string }, assignmentId?: string): QueueRow[] {
  const classIds = db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(user.role === "admin" ? undefined : eq(schema.classes.teacherId, user.id))
    .all()
    .map((c) => c.id);
  if (!classIds.length) return [];
  const A = schema.assignments;
  const rows = db
    .select({ att: schema.attempts, a: A, className: schema.classes.name, subject: schema.classes.subject, u: { id: schema.users.id, displayName: schema.users.displayName, username: schema.users.username, avatar: schema.users.avatar } })
    .from(schema.attempts)
    .innerJoin(A, eq(A.id, schema.attempts.assignmentId))
    .innerJoin(schema.classes, eq(schema.classes.id, A.classId))
    .innerJoin(schema.users, eq(schema.users.id, schema.attempts.studentId))
    .where(and(inArray(A.classId, classIds), eq(schema.attempts.status, "submitted"), assignmentId ? eq(A.id, assignmentId) : undefined))
    .orderBy(desc(schema.attempts.submittedAt))
    .all();
  const grades = new Map(
    rows.length ? db.select().from(schema.grades).where(inArray(schema.grades.attemptId, rows.map((r) => r.att.id))).all().map((g) => [g.attemptId, g]) : [],
  );
  const maxBy = new Map<string, number>();
  return rows.map(({ att, a, className, subject, u }) => {
    const g = grades.get(att.id);
    if (!maxBy.has(a.id)) maxBy.set(a.id, maxOf(a));
    const max = maxBy.get(a.id) || 1;
    const aiTotal = g?.aiTotal ?? sumAi(draftMarks(a, att));
    const state: GradeStatus = g?.status ?? (att.needsMarking ? "pending" : "done");
    return {
      attemptId: att.id,
      assignmentId: a.id,
      assignmentTitle: a.title,
      className: `${className} ${subject}`,
      student: u,
      submittedAt: att.submittedAt,
      state,
      auto: !g && !att.needsMarking,
      aiPct: Math.round((aiTotal / max) * 100),
      scorePct: state === "done" && att.score != null ? Math.round((att.score / (att.maxScore || max)) * 100) : null,
    };
  });
}

/** Per-question final score for the student result: teacher marks when done, else auto marks (null = waiting). */
export function studentMarks(a: Assignment, att: Attempt) {
  const g = getGrade(att.id);
  const draft = draftMarks(a, att);
  const done = g?.status === "done" || (!g && !att.needsMarking);
  const out: Record<string, { score: number | null; note: string; tags: string[]; annotations: NonNullable<QuestionGrade["annotations"]>; steps: StepMark[] }> = {};
  for (const q of gradeQuestions(a)) {
    const m = g?.marks[q.id];
    const auto = q.type === "mc" || q.type === "short";
    out[q.id] = {
      score: done ? (g ? finalScore(m) : (draft[q.id]?.ai ?? 0)) : auto ? (draft[q.id]?.ai ?? 0) : null,
      note: done ? (m?.note ?? "") : "",
      tags: done ? (m?.tags ?? []) : [],
      annotations: done ? (m?.annotations ?? []) : [],
      steps: done && !auto ? (m?.steps ?? m?.aiSteps ?? []) : [],
    };
  }
  return { marks: out, comment: done ? (g?.comment ?? "") : "", released: done };
}
