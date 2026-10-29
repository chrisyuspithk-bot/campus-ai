import "server-only";
import type { EssayFeedback, RubricScores } from "@/lib/db/schema";
import { RUBRIC, clampScore, gradeFor, wordCount } from "@/lib/essay";

type EssayInput = { title: string; subject: "chinese" | "english"; genre: string; prompt: string; wordTarget: number; content: string };

export function essayPrompt(e: EssayInput) {
  return {
    system: [
      "You are a supportive secondary-school writing teacher giving FIRST-PASS feedback on a student essay with a fixed rubric.",
      "Rubric (score each 1–5): content (ideas, relevance to the task, development), organisation (structure, paragraphing, cohesion), grammar (accuracy, punctuation), vocabulary (range, precision, register).",
      'JSON shape: {"scores":{"content":n,"organisation":n,"grammar":n,"vocabulary":n},"summary":string,"highlights":[string],"improvements":[string]}.',
      "2–4 highlights quoting short phrases from the essay. 3–5 improvements that are GUIDED: point to the place, explain the issue, ask a question or give a hint — do NOT rewrite whole paragraphs or the essay.",
      `Write the feedback in ${e.subject === "english" ? "English" : "Traditional Chinese (Hong Kong written style)"}.`,
    ].join("\n"),
    prompt: `Task: ${e.title}\nGenre: ${e.genre}\nSuggested length: ${e.wordTarget}\nRequirements: ${e.prompt || "(none)"}\n\nEssay:\n"""\n${e.content.slice(0, 15_000)}\n"""`,
  };
}

export function normalizeFeedback(raw: unknown): EssayFeedback | null {
  const o = raw as { scores?: Record<string, unknown>; summary?: unknown; highlights?: unknown; improvements?: unknown };
  if (!o?.scores) return null;
  const scores = Object.fromEntries(RUBRIC.map((k) => [k, clampScore(o.scores?.[k])])) as RubricScores;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 400)).filter(Boolean).slice(0, 6) : []);
  return {
    grade: gradeFor(scores),
    scores,
    summary: typeof o.summary === "string" ? o.summary.slice(0, 800) : "",
    highlights: list(o.highlights),
    improvements: list(o.improvements),
  };
}

const CONNECTIVES_ZH = /首先|其次|然後|接著|最後|總括|總而言之|因此|可是|然而|不但|而且|雖然|例如/g;
const CONNECTIVES_EN = /\b(first(ly)?|second(ly)?|then|next|finally|however|moreover|therefore|for example|in conclusion|although|because)\b/gi;

/** Demo-mode marker: transparent heuristics over length, paragraphing, connectives, punctuation and variety. */
export function mockFeedback(e: EssayInput): EssayFeedback {
  const en = e.subject === "english";
  const text = e.content.trim();
  const words = wordCount(text);
  const ratio = words / Math.max(50, e.wordTarget);
  const paras = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const connectives = (text.match(en ? CONNECTIVES_EN : CONNECTIVES_ZH) ?? []).length;
  const sentences = text.split(/[。！？.!?]+/).map((s) => s.trim()).filter(Boolean);
  const avgLen = sentences.length ? text.length / sentences.length : text.length;
  const tokens = en ? text.toLowerCase().match(/[a-z']+/g) ?? [] : text.match(/[㐀-鿿]/g) ?? [];
  const variety = tokens.length ? new Set(tokens).size / tokens.length : 0;

  const content = clampScore(ratio >= 1.1 && paras.length >= 4 ? 5 : ratio >= 0.9 ? 4 : ratio >= 0.6 ? 3 : ratio >= 0.3 ? 2 : 1);
  const organisation = clampScore((paras.length >= 4 ? 4 : paras.length >= 3 ? 3 : paras.length === 2 ? 2 : 1) + (connectives >= 3 ? 1 : 0));
  const punctOk = en ? /[.!?]["')\]]?\s*$/.test(text) && avgLen < 160 : avgLen < 60;
  const grammar = clampScore(3 + (punctOk ? 1 : -1) + (words > 80 && sentences.length >= 5 ? 0 : -1));
  const vocabulary = clampScore(en ? (variety >= 0.6 ? 4 : variety >= 0.45 ? 3 : 2) + (words > 150 && variety >= 0.55 ? 1 : 0) : (variety >= 0.55 ? 4 : variety >= 0.4 ? 3 : 2) + (words > 300 && variety >= 0.5 ? 1 : 0));
  const scores: RubricScores = { content, organisation, grammar, vocabulary };

  const firstSentence = sentences[0]?.slice(0, 40) ?? "";
  const highlights: string[] = [];
  const improvements: string[] = [];
  if (en) {
    highlights.push(firstSentence ? `Your opening "${firstSentence}…" gets straight into the topic.` : "You have started — that's the hardest step!");
    if (connectives >= 2) highlights.push(`Good use of linking words (${connectives} found) to guide the reader.`);
    if (variety >= 0.55) highlights.push("A nice range of vocabulary with little repetition.");
    if (ratio < 0.9) improvements.push(`Length: about ${words} words vs. the suggested ${e.wordTarget}. Which paragraph could you develop with an example or a detail?`);
    if (paras.length < 4) improvements.push("Structure: try an introduction, two or three body paragraphs and a conclusion. Where does your main idea change? Start a new paragraph there.");
    if (connectives < 3) improvements.push('Cohesion: add linking words such as "However", "As a result" or "Finally" between ideas. Which two sentences need a clearer link?');
    if (!punctOk) improvements.push("Sentences: some sentences are long or missing end punctuation. Read them aloud — where would you naturally pause?");
    improvements.push("Ending: does your last paragraph return to the question in the task? Try one sentence that sums up your view.");
  } else {
    highlights.push(firstSentence ? `開首「${firstSentence}……」能直接帶出主題。` : "你已經開始寫，係好開始！");
    if (connectives >= 2) highlights.push(`善用連接詞（共 ${connectives} 個），段落之間較流暢。`);
    if (variety >= 0.5) highlights.push("用字有變化，重複字詞不多。");
    if (ratio < 0.9) improvements.push(`篇幅：約 ${words} 字，建議 ${e.wordTarget} 字。邊一段可以加入具體例子或細節描寫？`);
    if (paras.length < 4) improvements.push("組織：試分成開首、兩至三段正文同結尾。你嘅意思喺邊度轉換？嗰度就可以分段。");
    if (connectives < 3) improvements.push("銜接：可加入「首先」「然而」「總括而言」等連接詞。邊兩句之間需要更清楚嘅關係？");
    if (!punctOk) improvements.push("標點：部分句子太長，試讀出嚟——邊度應該停頓、用逗號或句號？");
    improvements.push("結尾：最後一段有冇回應題目？試用一兩句總結你嘅感受或看法。");
  }
  const grade = gradeFor(scores);
  return {
    grade,
    scores,
    summary: en
      ? `(Demo mode — rule-based estimate.) Overall ${grade}. Focus on the guided suggestions below, revise, then ask for feedback again to compare versions.`
      : `（示範模式：以規則估算。）整體 ${grade}。先按下面嘅引導改進，再按「重新評」比較版本。`,
    highlights: highlights.slice(0, 4),
    improvements: improvements.slice(0, 5),
  };
}
