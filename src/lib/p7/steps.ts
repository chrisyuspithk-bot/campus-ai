// P7 (G3) step-level partial credit for long / upload answers.
// The marking scheme's "[n]" markers (e.g. "(a) (x+2)(x+3) [2]") define the steps; the AI draft (model or rule-based)
// awards marks per step, the teacher edits them in the workbench, and the question score is the sum.

import type { StepMark } from "@/lib/db/schema";
import { normAnswer } from "@/lib/p4/answer";

export type SchemeStep = { label: string; ref: string; marksMax: number };

/** "(a) (x+2)(x+3) [2]\n(b) x+3 [1]" → steps. Without markers the whole question is one step. */
export function schemeSteps(answer: string, marks: number): SchemeStep[] {
  const lines = answer.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: SchemeStep[] = [];
  for (const line of lines) {
    const m = line.match(/^(.*?)\s*\[(\d+)\]\s*$/);
    if (!m) continue;
    const body = m[1].trim();
    const part = body.match(/^\(([a-z]|i{1,3}|iv|v)\)\s*/i);
    out.push({ label: part ? `(${part[1]}) ${body.slice(part[0].length)}`.slice(0, 80) : body.slice(0, 80) || `步驟 ${out.length + 1}`, ref: body, marksMax: Number(m[2]) });
  }
  const sum = out.reduce((s, x) => s + x.marksMax, 0);
  if (!out.length || sum !== marks) return [{ label: "整體作答", ref: answer.replace(/\[\d+\]/g, ""), marksMax: marks }];
  return out;
}

/** Key fragments of one reference line ("(x+2)(x+3)", "26", "米"…). */
function fragments(ref: string) {
  return [...new Set(ref.split(/[；;，,。、\n]|\s+|[（）]/).map((f) => normAnswer(f.replace(/^\([a-z]\)/i, ""))).filter((f) => f.length >= 2 || /\d/.test(f)))];
}

/** Rule-based steps: coverage of each step's reference fragments in the student's text. */
export function ruleSteps(answer: string, marks: number, text: string): StepMark[] {
  const t = normAnswer(text);
  return schemeSteps(answer, marks).map((s) => {
    const frags = fragments(s.ref);
    const hit = frags.filter((f) => t.includes(f)).length;
    const cov = !t ? 0 : frags.length ? hit / frags.length : 0.5;
    const marksAwarded = cov >= 1 ? s.marksMax : Math.min(s.marksMax, Math.floor(s.marksMax * cov));
    const missing = frags.filter((f) => !t.includes(f)).slice(0, 2);
    return {
      label: s.label,
      marksMax: s.marksMax,
      marksAwarded,
      ok: marksAwarded === s.marksMax,
      note: !t ? "未作答" : marksAwarded === s.marksMax ? "要點齊全" : missing.length ? `未見：${missing.join("、")}` : "部分正確",
    };
  });
}

/** Validate steps coming from a model or the workbench; marks are clamped and the total capped at the question marks. */
export function sanitizeSteps(raw: unknown, qMarks: number): StepMark[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const out: StepMark[] = [];
  for (const r of raw.slice(0, 12) as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const max = Math.max(0, Math.min(qMarks, Math.round(Number(r.marksMax))));
    if (!Number.isFinite(max)) continue;
    const got = Math.max(0, Math.min(max, Math.round(Number(r.marksAwarded)) || 0));
    out.push({
      label: String(r.label ?? `步驟 ${out.length + 1}`).slice(0, 120),
      marksMax: max,
      marksAwarded: got,
      ok: typeof r.ok === "boolean" ? r.ok && got === max : got === max,
      ...(typeof r.note === "string" && r.note.trim() ? { note: r.note.slice(0, 200) } : {}),
    });
  }
  return out.length ? out : undefined;
}

export function stepsTotal(steps: StepMark[], qMarks: number) {
  return Math.min(qMarks, steps.reduce((s, x) => s + x.marksAwarded, 0));
}

/** JSON-shape text for model prompts. */
export const STEPS_PROMPT =
  'steps: array of {"label":string,"ok":boolean,"marksAwarded":number,"marksMax":number,"note":string} — one per marking point of the item\'s "scheme" (keep its labels and marksMax; marksAwarded 0..marksMax; note one short Traditional Chinese phrase). score must equal the sum of marksAwarded.';
