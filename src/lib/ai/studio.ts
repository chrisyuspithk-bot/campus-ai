import "server-only";
import type { Flashcard, Flashcards, MindNode, Mindmap, Quiz, QuizQuestion, Worksheet, YoutubeNotes } from "@/lib/studio/types";
import { newId } from "@/lib/ids";

// ---- Prompts ---------------------------------------------------------------------------------

const MAX_SOURCE = 12_000;

export function studioPrompt(kind: "mindmap" | "flashcards" | "quiz" | "worksheet", source: string, opts: { teacher: boolean; count?: number }) {
  const src = `Source material:\n"""\n${source.slice(0, MAX_SOURCE)}\n"""`;
  switch (kind) {
    case "mindmap":
      return {
        system:
          'Build a study mind map from the source. JSON shape: {"root":{"label":string,"note":string,"children":[{"label":string,"note":string,"children":[...]}]}}. ' +
          "3–6 main branches, 2–4 sub-points each, max depth 3. Labels ≤ 12 words; notes are one short explanatory sentence.",
        prompt: src,
      };
    case "flashcards":
      return {
        system:
          `Create ${opts.count ?? 12} revision flashcards from the source. JSON shape: {"cards":[{"front":string,"back":string}]}. ` +
          "Front = concept/term/question (short); back = definition/answer (1–2 sentences). Cover the most important ideas, no duplicates.",
        prompt: src,
      };
    case "quiz":
      return {
        system:
          `Create ${opts.count ?? 6} multiple-choice practice questions from the source. JSON shape: {"questions":[{"q":string,"options":[string,string,string,string],"answer":number,"explain":string}]}. ` +
          "`answer` is the 0-based index of the correct option. `explain` briefly says why (guide understanding, don't just restate). Plausible distractors.",
        prompt: src,
      };
    case "worksheet":
      return {
        system:
          'Write a classroom-ready worksheet in Markdown from the source, following the school template: title, learning objectives, Part A (basic), Part B (application), Part C (challenge), then an "Answers" section for the teacher. JSON shape: {"markdown":string}. Use LaTeX ($…$) for maths. Only use material you are entitled to reuse; do not copy long passages verbatim.',
        prompt: src,
      };
  }
}

export function expandPrompt(map: Mindmap, instruction: string) {
  return {
    system:
      'You extend an existing study mind map. Given the map and an instruction (e.g. "add a branch: mitochondria"), return ONLY the new nodes to add. JSON shape: {"parent":string,"nodes":[{"label":string,"note":string,"children":[...]}]} where parent is the exact label of the existing node to attach to (use the root label if unsure).',
    prompt: `Current map:\n${JSON.stringify(stripIds(map.root))}\n\nInstruction: ${instruction}`,
  };
}

export type YoutubeContext = { title?: string; channel?: string; description?: string; lengthSeconds?: number; transcript: string; basis: "captions" | "pasted" | "metadata" };

export function youtubePrompt(url: string, ctx: YoutubeContext) {
  const meta = [
    ctx.title && `Title: ${ctx.title}`,
    ctx.channel && `Channel: ${ctx.channel}`,
    ctx.lengthSeconds && `Duration: ${Math.floor(ctx.lengthSeconds / 60)}m ${ctx.lengthSeconds % 60}s`,
    ctx.description && `Description:\n${ctx.description.slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const basis =
    ctx.basis === "captions"
      ? "The transcript below is the video's own captions; each line starts with its [mm:ss] timestamp. Timeline times MUST come from those timestamps."
      : ctx.basis === "pasted"
        ? "The transcript below was pasted by the student; use any timestamps it contains, otherwise estimate evenly across the video."
        : "No transcript is available. Base the notes on the title/description only, keep timeline times as rough estimates within the duration, and say briefly in the summary that it is based on the video's description.";
  return {
    system:
      'Summarise an educational video for revision. JSON shape: {"summary":string,"timeline":[{"t":"mm:ss","point":string}]}. ' +
      "summary = 3–5 sentences of the key ideas. 5–8 timeline points in chronological order, each a short revision point. " +
      "Write in the video's language (Traditional Chinese for Chinese videos). " +
      basis,
    prompt: `Video: ${url}\n${meta}\n\nTranscript:\n"""\n${ctx.transcript.slice(0, 20_000)}\n"""`,
  };
}

function stripIds(n: MindNode): unknown {
  return { label: n.label, note: n.note, children: n.children.map(stripIds) };
}

// ---- Normalisers (validate model JSON) ------------------------------------------------------

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function toNode(v: unknown, depth = 0): MindNode | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const label = str(o.label, 80);
  if (!label) return null;
  const children = depth < 3 && Array.isArray(o.children) ? o.children.map((c) => toNode(c, depth + 1)).filter((c): c is MindNode => !!c).slice(0, 8) : [];
  return { id: newId().slice(0, 8), label, note: str(o.note, 300) || undefined, children };
}

export function normalizeMindmap(raw: unknown): Mindmap | null {
  const root = toNode((raw as { root?: unknown })?.root);
  return root && root.children.length ? { root } : null;
}

export function normalizeExpand(raw: unknown): { parent: string; nodes: MindNode[] } | null {
  const o = raw as { parent?: unknown; nodes?: unknown };
  const nodes = Array.isArray(o?.nodes) ? o.nodes.map((n) => toNode(n, 1)).filter((n): n is MindNode => !!n) : [];
  return nodes.length ? { parent: str(o.parent, 80), nodes } : null;
}

export function normalizeCards(raw: unknown): Flashcards | null {
  const arr = (raw as { cards?: unknown })?.cards;
  if (!Array.isArray(arr)) return null;
  const cards = arr
    .map((c) => ({ front: str((c as Flashcard)?.front, 200), back: str((c as Flashcard)?.back, 500) }))
    .filter((c) => c.front && c.back)
    .slice(0, 40);
  return cards.length ? { cards } : null;
}

export function normalizeQuiz(raw: unknown): Quiz | null {
  const arr = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(arr)) return null;
  const questions = arr
    .map((x) => {
      const o = x as Record<string, unknown>;
      const options = Array.isArray(o.options) ? o.options.map((s) => str(s, 200)).filter(Boolean).slice(0, 5) : [];
      const answer = Number(o.answer);
      return { q: str(o.q, 500), options, answer, explain: str(o.explain, 500) };
    })
    .filter((q) => q.q && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
    .slice(0, 20);
  return questions.length ? { questions } : null;
}

export function normalizeWorksheet(raw: unknown): Worksheet | null {
  const md = str((raw as { markdown?: unknown })?.markdown, 50_000);
  return md ? { markdown: md } : null;
}

export function normalizeYoutube(raw: unknown, url: string, videoId: string): YoutubeNotes | null {
  const o = raw as { summary?: unknown; timeline?: unknown };
  const summary = str(o?.summary, 3000);
  const timeline = Array.isArray(o?.timeline)
    ? o.timeline
        .map((x) => ({ t: str((x as { t?: unknown }).t, 8), point: str((x as { point?: unknown }).point, 300) }))
        .filter((x) => x.point)
        .map((x) => ({ ...x, t: /^\d{1,2}(:\d{2}){1,2}$/.test(x.t) ? x.t : "00:00" }))
        .slice(0, 15)
    : [];
  return summary ? { url, videoId, summary, timeline } : null;
}

// ---- Demo-mode generators (derive real structure from the source text) ----------------------

export const SAMPLE_SOURCE = `# 細胞結構
細胞膜：控制物質進出細胞的薄膜。
細胞核：儲存遺傳物質（DNA），控制細胞的活動。
細胞質：細胞內進行化學反應的場所。
粒線體：進行呼吸作用、釋放能量的細胞器。
葉綠體：植物細胞進行光合作用的細胞器。
細胞壁：由纖維素組成，為植物細胞提供支持。
液泡：儲存水分和溶解物質，植物細胞的液泡較大。
核糖體：合成蛋白質的場所。`;

const isZh = (s: string) => /[㐀-鿿]/.test(s);

function lines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** "term：definition" style pairs; falls back to sentence → (first phrase, rest). */
export function extractPairs(text: string): Flashcard[] {
  const out: Flashcard[] = [];
  const seen = new Set<string>();
  for (const raw of lines(text)) {
    const l = raw.replace(/^[-*•\d.)、\s]+/, "").replace(/^#+\s*/, "");
    const m = l.match(/^(.{1,30}?)\s*(?:：|:|——|—| - | – |＝|=|是指|係指|is defined as|means|refers to)\s*(.{4,})$/i);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push({ front: m[1].trim(), back: m[2].trim() });
    }
  }
  if (out.length >= 3) return out;
  // Sentences: use a leading phrase as the "term".
  const sentences = text.split(/(?<=[。！？.!?])\s*|\n+/).map((s) => s.trim()).filter((s) => s.length >= 8 && s.length <= 200);
  for (const s of sentences) {
    const m = s.match(/^(.{2,16}?)(?:是|係|為|，|,|\s(?:is|are|was|were)\s)(.+)$/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push({ front: m[1].trim(), back: s });
    }
  }
  return out;
}

function topicOf(text: string, fallback: string) {
  const h = lines(text).find((l) => /^#\s/.test(l));
  if (h) return h.replace(/^#+\s*/, "").slice(0, 30);
  const first = lines(text)[0] ?? "";
  return first.length > 0 && first.length <= 24 && !/[：:。.]/.test(first) ? first : fallback;
}

function sourceOrSample(text: string) {
  return extractPairs(text).length >= 3 ? text : SAMPLE_SOURCE;
}

export function mockMindmap(text: string, title: string): Mindmap {
  const src = sourceOrSample(text);
  const pairs = extractPairs(src);
  const zh = isZh(src);
  const id = () => newId().slice(0, 8);
  // Group by "##" sections when present, else chunk pairs into 3–5 branches.
  const sections: { label: string; items: Flashcard[] }[] = [];
  let cur: { label: string; items: Flashcard[] } | null = null;
  for (const l of lines(src)) {
    if (/^##\s/.test(l)) {
      cur = { label: l.replace(/^#+\s*/, ""), items: [] };
      sections.push(cur);
    } else if (cur) {
      const p = extractPairs(l)[0];
      if (p) cur.items.push(p);
    }
  }
  let branches: MindNode[];
  if (sections.filter((s) => s.items.length).length >= 2) {
    branches = sections.map((s) => ({ id: id(), label: s.label, children: s.items.map((p) => ({ id: id(), label: p.front, note: p.back, children: [] })) }));
  } else {
    branches = pairs.slice(0, 10).map((p) => ({ id: id(), label: p.front, note: p.back, children: [] }));
    // Add a couple of derived sub-points so the map has depth.
    for (const b of branches.slice(0, 4)) {
      const bits = (b.note ?? "").split(/[，,、;；]/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 18).slice(0, 2);
      b.children = bits.map((s) => ({ id: id(), label: s, children: [] }));
    }
  }
  return {
    root: {
      id: id(),
      label: topicOf(src, title || (zh ? "學習重點" : "Key ideas")),
      note: zh ? "示範模式：由內容自動整理" : "Demo mode: generated from your text",
      children: branches,
    },
  };
}

export function mockCards(text: string): Flashcards {
  return { cards: extractPairs(sourceOrSample(text)).slice(0, 20) };
}

function shuffle<T>(arr: T[], seed: number) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mockQuiz(text: string, count = 6): Quiz {
  const pairs = extractPairs(sourceOrSample(text));
  const zh = isZh(pairs.map((p) => p.front + p.back).join(""));
  const questions: QuizQuestion[] = [];
  pairs.slice(0, count).forEach((p, i) => {
    const distractors = shuffle(pairs.filter((x) => x !== p), i + 7).slice(0, 3);
    const askTerm = i % 2 === 1;
    const options = shuffle([p, ...distractors], i + 3);
    const answer = options.indexOf(p);
    questions.push(
      askTerm
        ? {
            q: zh ? `以下描述指的是哪一個概念？\n「${p.back}」` : `Which concept matches this description?\n"${p.back}"`,
            options: options.map((o) => o.front),
            answer,
            explain: zh ? `「${p.front}」的重點：${p.back}。試比較其他選項的分別。` : `${p.front}: ${p.back}. Compare how the other options differ.`,
          }
        : {
            q: zh ? `「${p.front}」的正確描述是？` : `Which statement best describes "${p.front}"?`,
            options: options.map((o) => o.back),
            answer,
            explain: zh ? `記住關鍵詞：${p.front} → ${p.back.slice(0, 30)}。` : `Key idea: ${p.front} → ${p.back.slice(0, 60)}.`,
          },
    );
  });
  return { questions };
}

export function mockWorksheet(text: string, title: string): Worksheet {
  const pairs = extractPairs(sourceOrSample(text));
  const zh = isZh(pairs.map((p) => p.front).join("")) || isZh(title);
  const topic = topicOf(sourceOrSample(text), title);
  const a = pairs.slice(0, 4);
  const b = pairs.slice(4, 7);
  const md = zh
    ? `# ${topic}工作紙\n\n> 示範模式產生（校本範本）。可「存為草稿」再修改，P3 可送去題庫。\n\n**學習目標**\n- 認識${a.map((p) => p.front).join("、")}\n- 能解釋各部分的功能\n\n## 甲部：基本題\n${a.map((p, i) => `${i + 1}. 「${p.front}」的功能是甚麼？`).join("\n")}\n\n## 乙部：應用題\n${b.map((p, i) => `${i + 1 + a.length}. 試舉一例說明「${p.front}」在日常生活／實驗中的重要性。`).join("\n") || `${a.length + 1}. 試比較${a[0]?.front ?? "兩個概念"}與${a[1]?.front ?? "另一概念"}的異同。`}\n\n## 丙部：挑戰題\n${a.length + b.length + 1}. 如果缺少「${pairs[0]?.front ?? "此結構"}」，會出現甚麼後果？試解釋。\n\n---\n\n## 答案（教師用）\n${[...a, ...b].map((p, i) => `${i + 1}. ${p.back}`).join("\n")}\n`
    : `# Worksheet: ${topic}\n\n> Generated in demo mode (school template). Save as a draft to edit; send to the question bank in P3.\n\n**Learning objectives**\n- Recall ${a.map((p) => p.front).join(", ")}\n- Explain what each one does\n\n## Part A: Basics\n${a.map((p, i) => `${i + 1}. What is "${p.front}"?`).join("\n")}\n\n## Part B: Application\n${b.map((p, i) => `${i + 1 + a.length}. Give an everyday example that shows why "${p.front}" matters.`).join("\n") || `${a.length + 1}. Compare ${a[0]?.front ?? "two ideas"} and ${a[1]?.front ?? "another"}.`}\n\n## Part C: Challenge\n${a.length + b.length + 1}. What would happen without "${pairs[0]?.front ?? "this"}"? Explain.\n\n---\n\n## Answers (teacher)\n${[...a, ...b].map((p, i) => `${i + 1}. ${p.back}`).join("\n")}\n`;
  return { markdown: md };
}

export function mockExpand(map: Mindmap, instruction: string): { parent: string; nodes: MindNode[] } {
  const zh = isZh(instruction);
  const label = instruction.replace(/^(加|新增|增加)?(一個|一條)?(分枝|分支|節點|branch|node)\s*[:：]?\s*|^add( a)?( new)? (branch|node)\s*[:：]?\s*/i, "").trim().slice(0, 30) || (zh ? "新分枝" : "New branch");
  const id = () => newId().slice(0, 8);
  return {
    parent: map.root.label,
    nodes: [
      {
        id: id(),
        label,
        note: zh ? `示範模式：「${label}」的簡短說明，可再問 AI 補充。` : `Demo mode: a short note about "${label}".`,
        children: [
          { id: id(), label: zh ? "定義" : "Definition", children: [] },
          { id: id(), label: zh ? "例子" : "Example", children: [] },
        ],
      },
    ],
  };
}

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Demo-mode notes. With "[mm:ss] text" caption lines, picks real moments spread across the video. */
export function mockYoutube(url: string, videoId: string, ctx: YoutubeContext): YoutubeNotes {
  const { transcript, title } = ctx;
  const zh = isZh(transcript || title || "") || (!transcript && !title);
  const stamped = lines(transcript)
    .map((l) => l.match(/^\[(\d+(?::\d{2}){1,2})\]\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2].length > 8);
  let timeline: YoutubeNotes["timeline"];
  if (stamped.length) {
    const n = Math.min(8, stamped.length);
    timeline = Array.from({ length: n }, (_, i) => stamped[Math.floor((i * stamped.length) / n)]).map((m) => ({ t: m[1], point: m[2].slice(0, 160) }));
  } else {
    const pts = transcript
      ? transcript.split(/(?<=[。！？.!?])\s*|\n+/).map((s) => s.trim()).filter((s) => s.length > 8).slice(0, 6)
      : zh
        ? ["引入：今集主題同學習目標", "核心概念一：定義同例子", "核心概念二：常見誤解", "示範：一步步解題", "總結：三個重點", "延伸：課後練習建議"]
        : ["Intro: topic and goals", "Key idea 1: definition and example", "Key idea 2: common misconceptions", "Worked example", "Summary: three takeaways", "Next steps: practice"];
    const step = ctx.lengthSeconds ? ctx.lengthSeconds / Math.max(1, pts.length) : 95;
    timeline = pts.map((p, i) => ({ t: mmss(i * step), point: p.slice(0, 200) }));
  }
  const from = { captions: zh ? "根據影片字幕整理" : "based on the video's captions", pasted: zh ? "根據你貼上的字幕整理" : "based on the transcript you pasted", metadata: "" }[ctx.basis];
  const about = title ? (zh ? `「${title}」` : `"${title}"`) : "";
  return {
    url,
    videoId,
    summary: zh
      ? `（示範模式：未連接 AI，以下係${about}的示範重點${from ? `，${from}` : ""}。）影片重點只供個人溫習，請尊重版權，勿轉載。`
      : `(Demo mode: sample notes for ${about || "this video"}${from ? ` ${from}` : ""}.) For personal study only — please respect copyright.`,
    timeline,
  };
}
