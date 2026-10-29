import "server-only";
import { and, asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { QuestionType } from "@/lib/db/schema";

export const QUESTION_TYPES: QuestionType[] = ["mc", "short", "long", "upload"];
export const BANK_SUBJECTS = ["數學", "英文", "中文", "物理", "化學", "生物", "企業會計與財務概論", "資訊及通訊科技", "中史"];

export type BankFilter = { subject?: string; topic?: string; difficulty?: string; type?: string; scope?: string; q?: string; tag?: string };

/** School bank + the teacher's own questions, filtered. */
export function listQuestions(userId: string, f: BankFilter = {}) {
  const q = schema.questions;
  const visible = or(eq(q.scope, "school"), eq(q.ownerId, userId))!;
  const conds: SQL[] = [visible];
  if (f.subject) conds.push(eq(q.subject, f.subject));
  if (f.topic) conds.push(eq(q.topic, f.topic));
  if (f.difficulty && /^[123]$/.test(f.difficulty)) conds.push(eq(q.difficulty, Number(f.difficulty)));
  if (f.type && (QUESTION_TYPES as string[]).includes(f.type)) conds.push(eq(q.type, f.type as QuestionType));
  if (f.scope === "school") conds.push(eq(q.scope, "school"));
  if (f.scope === "mine") conds.push(eq(q.ownerId, userId));
  // P7: tag chip (e.g. "hkdse") — tags are a JSON array of strings.
  if (f.tag && /^[\w\u3400-\u9fff-]{1,30}$/.test(f.tag)) conds.push(like(q.tags, `%"${f.tag}"%`));
  if (f.q) conds.push(or(like(q.stem, `%${f.q}%`), like(q.code, `%${f.q}%`), like(q.topic, `%${f.q}%`))!);
  return db.select().from(q).where(and(...conds)).orderBy(asc(q.subject), desc(q.createdAt)).all();
}

export function bankTopics(userId: string) {
  const rows = listQuestions(userId);
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.topic) continue;
    if (!map.has(r.subject)) map.set(r.subject, new Set());
    map.get(r.subject)!.add(r.topic);
  }
  return Object.fromEntries([...map].map(([s, set]) => [s, [...set].sort()]));
}

export function getQuestion(id: string) {
  return db.select().from(schema.questions).where(eq(schema.questions.id, id)).get();
}

export function canSeeQuestion(userId: string, q: { scope: string; ownerId: string | null } | undefined) {
  return !!q && (q.scope === "school" || q.ownerId === userId);
}

/** Next free display code ("Q1001", "Q1002" …). */
export function nextCode() {
  const rows = db.select({ code: schema.questions.code }).from(schema.questions).all();
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.replace(/\D/g, "")) || 0), 1000);
  return `Q${max + 1}`;
}

export type DraftQuestion = {
  type: QuestionType;
  stem: string;
  options: string[];
  answer: string;
  marks: number;
  difficulty: number;
  topic?: string;
};

/** Validate model output / form input into a storable question. */
export function normalizeQuestion(raw: unknown): DraftQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = (QUESTION_TYPES as string[]).includes(String(r.type)) ? (r.type as QuestionType) : "short";
  const stem = String(r.stem ?? "").trim().slice(0, 4000);
  if (!stem) return null;
  const options = Array.isArray(r.options) ? r.options.map((o) => String(o).slice(0, 400)).filter(Boolean).slice(0, 6) : [];
  if (type === "mc" && options.length < 2) return null;
  let answer = String(r.answer ?? "").trim().slice(0, 2000);
  if (type === "mc") {
    const idx = /^[A-F]$/i.test(answer) ? answer.toUpperCase().charCodeAt(0) - 65 : Number(answer);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
    answer = String(idx);
  }
  const marks = Math.min(50, Math.max(1, Math.round(Number(r.marks) || (type === "long" ? 6 : type === "mc" ? 1 : 2))));
  const difficulty = Math.min(3, Math.max(1, Math.round(Number(r.difficulty) || 2)));
  const topic = r.topic ? String(r.topic).slice(0, 60) : undefined;
  return { type, stem, options: type === "mc" ? options : [], answer, marks, difficulty, topic };
}

export function normalizeQuestionList(raw: unknown): DraftQuestion[] | null {
  const list = raw && typeof raw === "object" ? (raw as { questions?: unknown }).questions : null;
  if (!Array.isArray(list)) return null;
  const out = list.map(normalizeQuestion).filter((q): q is DraftQuestion => !!q).slice(0, 10);
  return out.length ? out : null;
}

// ---- Demo-mode generators (no OpenRouter key) ---------------------------------------------------

/** Change the numbers in a stem: "x² − 5x + 6" → "x² − 7x + 12" style variants. */
function shiftNumbers(text: string, k: number) {
  return text.replace(/(?<![A-Za-z^\\])(\d+)(?![²³\d])/g, (m) => {
    const n = Number(m);
    if (n === 0 || n > 999) return m;
    return String(n + k * (n < 10 ? 1 : Math.ceil(n / 10)));
  });
}

const CONTEXTS = ["（情境：學校旅行）", "（情境：班會義賣）", "（情境：運動會）", "（情境：圖書館借書）"];

export function mockVariants(q: DraftQuestion & { topic?: string }, n: number): DraftQuestion[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const stem = i % 2 === 0 ? shiftNumbers(q.stem, k) : `${shiftNumbers(q.stem, k + 1)} ${CONTEXTS[i % CONTEXTS.length]}`;
    const options = q.options.map((o) => shiftNumbers(o, k));
    return {
      ...q,
      stem,
      options,
      answer: q.type === "mc" ? q.answer : q.type === "short" ? shiftNumbers(q.answer, k) : q.answer,
      difficulty: Math.min(3, Math.max(1, q.difficulty + (i === 2 ? 1 : 0))),
    };
  });
}

const MOCK_BANK: Record<string, DraftQuestion[]> = {
  數學: [
    { type: "mc", stem: "因式分解 $x^2 + 7x + 12$。", options: ["$(x+3)(x+4)$", "$(x+2)(x+6)$", "$(x-3)(x-4)$", "$(x+1)(x+12)$"], answer: "0", marks: 1, difficulty: 1 },
    { type: "short", stem: "解方程 $2x - 5 = 9$，求 $x$。", options: [], answer: "7|x=7", marks: 2, difficulty: 1 },
    { type: "mc", stem: "若 $x^2 - 9 = 0$，則 $x =$", options: ["$3$", "$-3$", "$\\pm 3$", "$9$"], answer: "2", marks: 1, difficulty: 2 },
    { type: "long", stem: "一個長方形花園的面積為 $x^2 + 5x + 6$ 平方米。\n(a) 因式分解該式。\n(b) 若闊為 $(x+2)$ 米，求長。\n(c) 當 $x = 4$，求花園周界。", options: [], answer: "(a) (x+2)(x+3) (b) x+3 (c) 2(6+7)=26 米", marks: 6, difficulty: 2 },
  ],
  英文: [
    { type: "mc", stem: "Choose the correct word: She ____ to school every day.", options: ["go", "goes", "going", "gone"], answer: "1", marks: 1, difficulty: 1 },
    { type: "short", stem: "Write the past tense of “write”.", options: [], answer: "wrote", marks: 1, difficulty: 1 },
    { type: "long", stem: "Write a short paragraph (80–100 words) about your favourite school event.", options: [], answer: "Content, organisation, language", marks: 8, difficulty: 2 },
  ],
};

export function mockGenerate(subject: string, topic: string, type: string, count: number): DraftQuestion[] {
  const base = MOCK_BANK[subject] ?? MOCK_BANK["數學"];
  const pool = type && type !== "any" ? base.filter((q) => q.type === type) : base;
  const src = pool.length ? pool : base;
  return Array.from({ length: count }, (_, i) => {
    const q = src[i % src.length];
    const v = i < src.length ? q : mockVariants(q, 1 + Math.floor(i / src.length))[Math.floor(i / src.length) - 1] ?? q;
    return { ...v, topic: topic || undefined };
  });
}
