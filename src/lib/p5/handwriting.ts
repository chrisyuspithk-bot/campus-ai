import "server-only";
import fs from "node:fs/promises";
import type { CurrentUser } from "@/lib/auth/dal";
import type { QuestionGrade } from "@/lib/db/schema";
import { gate, parseJsonObject, schoolPreamble } from "@/lib/ai/run";
import { completeChat, hasOpenRouterKey, type ContentPart } from "@/lib/ai/openrouter";
import { recordUsage } from "@/lib/quota";
import type { Assignment, Attempt } from "@/lib/p3/exam";
import { draftMarks, gradeQuestions } from "@/lib/p4/grading";
import { answersFromOcr, pagePath, type ScanPage } from "./scan";
import { sanitizeSteps, schemeSteps, stepsTotal, STEPS_PROMPT } from "@/lib/p7/steps";

/**
 * Vision model for handwriting (the deepseek chat models are text-only). Override with OPENROUTER_VISION_MODEL.
 * Default is Qwen VL: on this deployment's key the Google / OpenAI / Anthropic vision models return 403.
 */
export const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL?.trim() || "qwen/qwen3-vl-8b-instruct";
const MAX_PAGES = 6;

export type Recognised = {
  answers: Record<string, string>;
  marks: Record<string, QuestionGrade>;
  summary: string;
  mock: boolean;
};

async function dataUrl(p: ScanPage) {
  const sharp = (await import("sharp")).default;
  const buf = await sharp(await fs.readFile(pagePath(p))).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/** Rule-based draft on recognised text: MC/short auto-marked, long answers by key-point coverage. */
function ruleDraft(a: Assignment, answers: Record<string, string>) {
  const marks = draftMarks(a, { answers });
  for (const q of gradeQuestions(a)) marks[q.id] = { ...marks[q.id], ocr: answers[q.id] ?? "" };
  return marks;
}

/**
 * Handwriting recognition + first-pass marks for a scanned script.
 * With an OpenRouter key: one vision call reads the pages and scores against the marking scheme.
 * Without a key (or if the vision call fails): the OCR text from the scan queue + the rule-based draft.
 */
export async function recognise(user: CurrentUser, a: Assignment, att: Attempt, pages: ScanPage[]): Promise<{ ok: true; value: Recognised } | { ok: false; error: string }> {
  const g = gate(user, "handwriting", "grading", att.id);
  if (!g.ok) return { ok: false, error: g.error };
  const qs = gradeQuestions(a);
  const fallbackAnswers = { ...att.answers, ...answersFromOcr(a, pages) };
  const mock = (why: string): Recognised => {
    recordUsage(user.id, 200 + pages.length * 50);
    return { answers: fallbackAnswers, marks: ruleDraft(a, fallbackAnswers), summary: why, mock: true };
  };
  if (!hasOpenRouterKey() || !pages.length) return { ok: true, value: mock("（示範模式）手寫辨識用掃描佇列嘅 OCR 結果，再按參考答案要點估分。") };

  const items = qs.map((q, i) => ({ n: i + 1, id: q.id, type: q.type, marks: q.marks, question: q.stem, options: q.options, reference: q.type === "mc" ? "ABCDEF"[Number(q.answer)] ?? "" : q.answer.split("|")[0], ...(q.type === "long" || q.type === "upload" ? { scheme: schemeSteps(q.answer, q.marks).map(({ label, marksMax }) => ({ label, marksMax })) } : {}) }));
  const content: ContentPart[] = [
    { type: "text", text: `Questions and marking scheme (JSON):\n${JSON.stringify(items)}\n\nThe following ${Math.min(pages.length, MAX_PAGES)} image(s) are the student's handwritten script pages in order.` },
  ];
  for (const p of pages.slice(0, MAX_PAGES)) content.push({ type: "image_url", image_url: { url: await dataUrl(p) } });
  try {
    const { text, tokens } = await completeChat({
      model: VISION_MODEL,
      json: true,
      messages: [
        {
          role: "system",
          content: [
            schoolPreamble(user),
            "You read a Hong Kong secondary-school student's HANDWRITTEN exam script and give a FIRST-PASS score.",
            'Respond with one JSON object only: {"items":[{"n":number,"text":string,"score":number,"note":string,"steps":[...]}],"summary":string}.',
            "text: transcribe exactly what the student wrote for question n (MC: just the letter). Empty string if blank or illegible.",
            "score: integer 0..marks against the reference. note: one short sentence (Traditional Chinese, HK written style) naming what is right and the concept gap.",
            `Only for items that have a "scheme" (long answers): ${STEPS_PROMPT}`,
          ].join("\n"),
        },
        { role: "user", content },
      ],
    });
    recordUsage(user.id, tokens);
    const o = parseJsonObject(text) as { items?: { n?: unknown; text?: unknown; score?: unknown; note?: unknown; steps?: unknown }[]; summary?: unknown } | null;
    if (!o || !Array.isArray(o.items)) return { ok: true, value: mock("視覺模型回覆格式唔啱，改用 OCR 結果＋規則估分。") };
    const answers: Record<string, string> = { ...att.answers };
    const vision = new Map<string, { score: number; note: string; steps?: ReturnType<typeof sanitizeSteps> }>();
    for (const it of o.items) {
      const q = qs[Number(it.n) - 1];
      if (!q) continue;
      let v = typeof it.text === "string" ? it.text.slice(0, 2000) : "";
      if (q.type === "mc") {
        const k = "ABCDEF".indexOf(v.trim().charAt(0).toUpperCase());
        v = k >= 0 ? String(k) : "";
      }
      answers[q.id] = v;
      const n = Math.round(Number(it.score));
      const steps = q.type === "long" || q.type === "upload" ? sanitizeSteps(it.steps, q.marks) : undefined;
      vision.set(q.id, { score: steps ? stepsTotal(steps, q.marks) : Number.isFinite(n) ? Math.max(0, Math.min(q.marks, n)) : 0, note: typeof it.note === "string" ? it.note.slice(0, 300) : "", steps });
    }
    const marks = ruleDraft(a, answers);
    for (const q of qs) {
      const v = vision.get(q.id);
      // MC/short keep the exact auto-mark on the transcription; long answers take the model's judgement.
      if (v && (q.type === "long" || q.type === "upload")) marks[q.id] = { ...marks[q.id], ai: v.score, aiNote: `手寫辨識：${v.note}`, aiSteps: v.steps ?? marks[q.id]?.aiSteps };
    }
    return { ok: true, value: { answers, marks, summary: typeof o.summary === "string" ? o.summary.slice(0, 600) : "手寫辨識完成。", mock: false } };
  } catch (e) {
    console.warn("[handwriting] vision call failed:", (e as Error).message);
    return { ok: true, value: mock("視覺模型暫時用唔到，改用 OCR 結果＋規則估分。") };
  }
}
