"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { newId } from "@/lib/ids";
import { runStructured } from "@/lib/ai/run";
import type { DictKey } from "@/lib/i18n/dict";
import { BANK_SUBJECTS, canSeeQuestion, getQuestion, mockGenerate, mockVariants, nextCode, normalizeQuestion, normalizeQuestionList, type DraftQuestion } from "@/lib/p3/bank";

function insertQuestion(ownerId: string, q: DraftQuestion, meta: { subject: string; topic: string; level?: string; parentId?: string | null }) {
  const id = newId();
  db.insert(schema.questions)
    .values({
      id,
      code: nextCode(),
      ownerId,
      scope: "mine",
      subject: meta.subject,
      topic: q.topic ?? meta.topic,
      level: meta.level ?? "",
      difficulty: q.difficulty,
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      marks: q.marks,
      parentId: meta.parentId ?? null,
    })
    .run();
  return id;
}

const subjectOf = (v: FormDataEntryValue | null) => (BANK_SUBJECTS.includes(String(v)) ? String(v) : BANK_SUBJECTS[0]);

export async function createQuestion(form: FormData) {
  const user = await requireUser(["teacher"]);
  const options = String(form.get("options") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const q = normalizeQuestion({
    type: form.get("type"),
    stem: form.get("stem"),
    options,
    answer: form.get("answer"),
    marks: form.get("marks"),
    difficulty: form.get("difficulty"),
  });
  if (!q) return appRedirect("/t/bank?err=invalid");
  const id = insertQuestion(user.id, q, { subject: subjectOf(form.get("subject")), topic: String(form.get("topic") ?? "").slice(0, 60), level: String(form.get("level") ?? "") });
  return appRedirect(`/t/bank?sel=${id}&scope=mine`);
}

/** "題幹 | A;B;C;D | 答案" per line; no options = short answer. */
export async function importQuestions(form: FormData) {
  const user = await requireUser(["teacher"]);
  const subject = subjectOf(form.get("subject"));
  const topic = String(form.get("topic") ?? "").slice(0, 60);
  let n = 0;
  for (const line of String(form.get("text") ?? "").split("\n").slice(0, 200)) {
    const [stem, opts, answer] = line.split("|").map((s) => s?.trim() ?? "");
    if (!stem) continue;
    const options = (opts ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    const q = normalizeQuestion({ type: options.length >= 2 ? "mc" : "short", stem, options, answer: answer ?? "" });
    if (!q) continue;
    insertQuestion(user.id, q, { subject, topic });
    n++;
  }
  return appRedirect(`/t/bank?scope=mine&msg=imported&n=${n}`);
}

export async function generateQuestions(form: FormData) {
  const user = await requireUser(["teacher"]);
  const subject = subjectOf(form.get("subject"));
  const topic = String(form.get("topic") ?? "").trim().slice(0, 60);
  const type = String(form.get("type") ?? "any");
  const count = Math.min(8, Math.max(1, Math.round(Number(form.get("count")) || 3)));
  const res = await runStructured({
    user,
    source: "bank",
    input: `${subject} ${topic}`,
    system: "You write exam questions for Hong Kong secondary schools. Use LaTeX ($...$) for maths.",
    prompt: `Write ${count} ${type === "any" ? "mixed-type" : type} questions for ${subject}${topic ? `, topic: ${topic}` : ""}.\nReturn {"questions":[{"type":"mc|short|long","stem":"...","options":["..."],"answer":"A (mc) / accepted answers separated by | (short) / marking notes (long)","marks":1,"difficulty":1-3}]}`,
    normalize: normalizeQuestionList,
    mock: () => mockGenerate(subject, topic, type, count),
  });
  if (!res.ok) return appRedirect(`/t/bank?err=${res.error}`);
  for (const q of res.value) insertQuestion(user.id, q, { subject, topic });
  return appRedirect(`/t/bank?scope=mine&msg=generated&n=${res.value.length}`);
}

export async function deleteQuestion(form: FormData) {
  const user = await requireUser(["teacher"]);
  const id = String(form.get("id") ?? "");
  db.delete(schema.questions).where(and(eq(schema.questions.id, id), eq(schema.questions.ownerId, user.id), eq(schema.questions.scope, "mine"))).run();
  revalidatePath("/t/bank");
}

export async function addToPaper(form: FormData) {
  const user = await requireUser(["teacher"]);
  const q = getQuestion(String(form.get("questionId") ?? ""));
  const paper = db.select().from(schema.papers).where(and(eq(schema.papers.id, String(form.get("paperId") ?? "")), eq(schema.papers.ownerId, user.id))).get();
  if (!q || !canSeeQuestion(user.id, q) || !paper) return appRedirect("/t/bank?err=invalid");
  const sections = paper.sections.length ? paper.sections : [{ title: "一、", questionIds: [] }];
  if (!sections.some((s) => s.questionIds.includes(q.id))) sections[sections.length - 1].questionIds.push(q.id);
  db.update(schema.papers).set({ sections, updatedAt: new Date() }).where(eq(schema.papers.id, paper.id)).run();
  const back = String(form.get("back") ?? "/t/bank");
  return appRedirect(`${back.startsWith("/t/bank") ? back : "/t/bank"}${back.includes("?") ? "&" : "?"}added=${paper.id}`);
}

// ---- Variants ------------------------------------------------------------------------------------

export type VariantDraft = DraftQuestion;

export async function generateVariants(questionId: string, n: number): Promise<{ ok: true; variants: VariantDraft[] } | { ok: false; error: DictKey }> {
  const user = await requireUser(["teacher"]);
  const q = getQuestion(questionId);
  if (!q || !canSeeQuestion(user.id, q)) return { ok: false, error: "p2.err.generic" };
  const count = Math.min(6, Math.max(1, Math.round(n) || 3));
  const base: DraftQuestion = { type: q.type, stem: q.stem, options: q.options, answer: q.answer, marks: q.marks, difficulty: q.difficulty, topic: q.topic };
  const res = await runStructured({
    user,
    source: "bank",
    input: q.stem,
    system: "You write variants of exam questions: change numbers or the real-life context, keep the skill and type. Use LaTeX ($...$) for maths.",
    prompt: `Original (${q.type}, ${q.marks} marks, difficulty ${q.difficulty}/3):\n${q.stem}\n${q.options.length ? `Options: ${JSON.stringify(q.options)}\n` : ""}Answer: ${q.answer}\n\nWrite ${count} variants. Return {"questions":[{"type":"${q.type}","stem":"...","options":[...],"answer":"...","marks":${q.marks},"difficulty":1-3}]} — for mc, answer is the letter of the correct option.`,
    normalize: normalizeQuestionList,
    mock: () => mockVariants(base, count),
  });
  if (!res.ok) return { ok: false, error: `p2.err.${res.error === "bad_output" || res.error === "upstream" ? "generic" : res.error}` as DictKey };
  return { ok: true, variants: res.value.map((v) => ({ ...v, type: q.type })) };
}

export async function saveVariants(questionId: string, variants: VariantDraft[]): Promise<{ saved: number }> {
  const user = await requireUser(["teacher"]);
  const q = getQuestion(questionId);
  if (!q || !canSeeQuestion(user.id, q)) return { saved: 0 };
  let saved = 0;
  for (const v of variants.slice(0, 10)) {
    const norm = normalizeQuestion({ ...v, type: q.type });
    if (!norm) continue;
    insertQuestion(user.id, norm, { subject: q.subject, topic: q.topic, level: q.level, parentId: q.id });
    saved++;
  }
  revalidatePath(`/t/bank/${q.id}/variants`);
  return { saved };
}
