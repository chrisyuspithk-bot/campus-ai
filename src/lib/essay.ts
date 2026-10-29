// Shared (client + server) essay helpers. Rubric is fixed: 內容／組織／語法／詞彙, 1–5 each.
import type { RubricScores } from "@/lib/db/schema";

export const RUBRIC = ["content", "organisation", "grammar", "vocabulary"] as const;
export const GENRES = ["narrative", "descriptive", "argumentative", "expository", "letter", "speech"] as const;
export const SUBJECTS = ["chinese", "english"] as const;

/** CJK characters count one each; Latin words count one each. */
export function wordCount(text: string) {
  const cjk = text.match(/[㐀-鿿豈-﫿]/g)?.length ?? 0;
  const latin = text.replace(/[㐀-鿿豈-﫿]/g, " ").match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
  return cjk + latin;
}

export function totalScore(s: RubricScores) {
  return RUBRIC.reduce((sum, k) => sum + (s[k] ?? 0), 0);
}

/** Total out of 20 → letter grade. */
export function gradeFor(s: RubricScores) {
  const t = totalScore(s);
  return t >= 18 ? "A" : t >= 16 ? "A-" : t >= 14 ? "B+" : t >= 12 ? "B" : t >= 10 ? "C+" : t >= 8 ? "C" : t >= 6 ? "D" : "E";
}

export function clampScore(v: unknown) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
}

export const STATUS_BADGE: Record<string, string> = {
  draft: "",
  ai_scored: "bg-brand-50 text-brand-700",
  submitted: "bg-amber-50 text-amber-800",
  returned: "bg-teal-50 text-teal-700",
};
