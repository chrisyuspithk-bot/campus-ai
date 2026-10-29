import "server-only";
import type { CreateKind, CreateMessage } from "@/lib/db/schema";

// Create Lab (P2): chat-driven static HTML (poster / mini web page / slide outline). Rendered in a
// sandboxed iframe without scripts, so the output is plain HTML + inline CSS only.

const KIND_BRIEF: Record<CreateKind, string> = {
  poster: "a single-page A4 portrait poster (big headline, short tagline, 3–4 key points, date/venue line)",
  webpage: "a small single-page website (header, 2–3 content sections, simple footer)",
  slides: "a slide outline: 5–8 slides stacked vertically, each a 16:9 box with a title and 2–4 bullet points",
  code: "a small HTML page",
};

export function createPrompt(kind: CreateKind, history: CreateMessage[], html: string, message: string) {
  return {
    system: [
      `You help a secondary-school student design ${KIND_BRIEF[kind]}.`,
      "Reply briefly (1–3 sentences) in the student's language, describe what you changed, and ask at most one follow-up question about style.",
      'JSON shape: {"reply":string,"title":string,"html":string}. `html` is a complete standalone HTML document with inline <style>; NO <script>, no external resources except Google-safe system fonts. Keep it school-appropriate.',
      "Always return the FULL updated html, keeping the student's earlier choices unless they ask to change them.",
    ].join("\n"),
    prompt: `Conversation so far:\n${history.slice(-10).map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nCurrent HTML:\n${html.slice(0, 20_000) || "(none yet)"}\n\nStudent: ${message}`,
  };
}

export type CreateTurn = { reply: string; title: string; html: string };

/** Strip scripts / event handlers / external loads — the iframe is sandboxed too, this is defence in depth. */
export function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2")
    .slice(0, 100_000);
}

export function normalizeCreate(raw: unknown): CreateTurn | null {
  const o = raw as { reply?: unknown; title?: unknown; html?: unknown };
  if (typeof o?.html !== "string" || !o.html.trim()) return null;
  return {
    reply: typeof o.reply === "string" ? o.reply.slice(0, 1000) : "",
    title: typeof o.title === "string" ? o.title.trim().slice(0, 80) : "",
    html: sanitizeHtml(o.html),
  };
}

// ---- Demo mode ----------------------------------------------------------------------------------

const PALETTES: { re: RegExp; colors: [string, string, string] }[] = [
  { re: /藍綠|blue.?green|teal|環保|green week/i, colors: ["#0f766e", "#0284c7", "#ecfeff"] },
  { re: /綠|green|環保|eco/i, colors: ["#15803d", "#65a30d", "#f0fdf4"] },
  { re: /藍|blue/i, colors: ["#1d4ed8", "#0ea5e9", "#eff6ff"] },
  { re: /紅|red|新年|聖誕|christmas/i, colors: ["#b91c1c", "#f59e0b", "#fef2f2"] },
  { re: /黃|橙|yellow|orange/i, colors: ["#c2410c", "#eab308", "#fffbeb"] },
  { re: /紫|粉|purple|pink/i, colors: ["#7e22ce", "#db2777", "#faf5ff"] },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const isZh = (s: string) => /[㐀-鿿]/.test(s);

/** Pull a topic like "環保周" out of "做一張環保周海報" / "a poster for Green Week". */
function topicFrom(text: string) {
  const zh = text.match(/(?:做|整|設計|寫)?(?:一|個|張|份|篇)*([㐀-鿿\w ]{2,12}?)(?:嘅|的)?(?:海報|網頁|網站|簡報|poster|website|slides)/i);
  if (zh?.[1]?.trim()) return zh[1].replace(/^(一|個|張|份)+/, "").trim();
  const en = text.match(/(?:poster|page|website|slides?|presentation)\s+(?:for|about|on)\s+(?:the\s+)?([\w ]{2,30})/i);
  return en?.[1]?.trim() ?? "";
}

export function mockCreate(kind: CreateKind, history: CreateMessage[], message: string, prevTitle: string): CreateTurn {
  const all = [...history.filter((m) => m.role === "user").map((m) => m.content), message].join("\n");
  const zh = isZh(all);
  const topic = topicFrom(message) || topicFrom(all) || prevTitle || (zh ? "校園活動" : "School event");
  const palette = [...PALETTES].reverse().find((p) => p.re.test(message))?.colors ?? PALETTES.find((p) => p.re.test(all))?.colors ?? ["#1e3a8a", "#0d9488", "#f8fafc"];
  const [c1, c2, bg] = palette;
  const points = zh
    ? ["一齊減少即棄膠樽", "午膳自備餐具", "課室熄燈慳電", "參加校園回收日"]
    : ["Bring your own bottle", "Reusable lunch boxes", "Lights off when you leave", "Join recycling day"];
  const t = esc(topic);
  const font = "font-family:'Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif";

  let html: string;
  if (kind === "slides") {
    const slides = zh
      ? [[t, ["學生作品", "日期：＿＿＿"]], ["背景", ["為甚麼重要？", "我們觀察到的問題"]], ["重點一", points.slice(0, 2)], ["重點二", points.slice(2)], ["行動", ["我們可以做甚麼", "時間表"]], ["總結", ["多謝聆聽！", "問答時間"]]]
      : [[t, ["Student project", "Date: ____"]], ["Background", ["Why it matters", "What we noticed"]], ["Point 1", points.slice(0, 2)], ["Point 2", points.slice(2)], ["Action", ["What we can do", "Timeline"]], ["Summary", ["Thank you!", "Q&A"]]];
    html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:${bg};${font}}.s{aspect-ratio:16/9;max-width:720px;margin:0 auto 20px;background:#fff;border-radius:12px;box-shadow:0 2px 10px #0002;padding:32px 40px;box-sizing:border-box;border-top:10px solid ${c1}}h2{color:${c1};margin:0 0 16px;font-size:30px}li{font-size:20px;margin:8px 0;color:#334155}.n{float:right;color:${c2};font-weight:700}</style></head><body>${slides
      .map(([h, b], i) => `<section class="s"><span class="n">${i + 1}</span><h2>${h}</h2><ul>${(b as string[]).map((x) => `<li>${x}</li>`).join("")}</ul></section>`)
      .join("")}</body></html>`;
  } else if (kind === "webpage") {
    html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;${font};color:#1e293b;background:${bg}}header{background:linear-gradient(135deg,${c1},${c2});color:#fff;padding:48px 24px;text-align:center}h1{margin:0;font-size:36px}main{max-width:760px;margin:0 auto;padding:24px}section{background:#fff;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 1px 4px #0001}h2{color:${c1};margin-top:0}footer{text-align:center;color:#64748b;padding:24px;font-size:14px}</style></head><body><header><h1>${t}</h1><p>${zh ? "由同學設計嘅網頁小作" : "A mini site made by students"}</p></header><main><section><h2>${zh ? "簡介" : "About"}</h2><p>${zh ? `歡迎嚟到「${t}」！呢度會介紹活動內容同參與方法。` : `Welcome to ${t}! Here's what it's about and how to join.`}</p></section><section><h2>${zh ? "重點" : "Highlights"}</h2><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul></section><section><h2>${zh ? "點樣參加" : "How to join"}</h2><p>${zh ? "留意學校通告，或向班主任報名。" : "Watch for school notices or sign up with your class teacher."}</p></section></main><footer>© ${zh ? "學生作品" : "Student work"}</footer></body></html>`;
  } else {
    html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#e2e8f0;${font}}.p{width:420px;aspect-ratio:1/1.414;background:linear-gradient(160deg,${c1},${c2});color:#fff;border-radius:8px;box-shadow:0 10px 30px #0003;padding:40px 36px;box-sizing:border-box;display:flex;flex-direction:column}.tag{letter-spacing:.2em;font-size:13px;opacity:.85}h1{font-size:44px;line-height:1.1;margin:12px 0}.sub{font-size:18px;opacity:.95}ul{list-style:none;padding:0;margin:auto 0 0}li{background:${bg};color:${c1};margin:8px 0;padding:10px 14px;border-radius:999px;font-weight:600}.f{margin-top:18px;font-size:13px;opacity:.9}</style></head><body><div class="p"><div class="tag">${zh ? "校園活動" : "SCHOOL EVENT"}</div><h1>${t}</h1><div class="sub">${zh ? "由我做起，一齊改變！" : "Small steps, big change!"}</div><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul><div class="f">${zh ? "日期：＿＿＿　地點：禮堂" : "Date: ____  Venue: School hall"}</div></div></body></html>`;
  }
  const changed = history.length ? (zh ? "已按你嘅要求更新預覽" : "Updated the preview as requested") : zh ? `已整好「${topic}」初稿` : `Here's a first draft of “${topic}”`;
  return {
    reply: zh ? `（示範模式）${changed} →　想換顏色（例如「藍綠」「紅色」）或者改字，直接話我知。` : `(Demo mode) ${changed} → Want different colours (e.g. "blue", "red") or wording? Just tell me.`,
    title: topic,
    html,
  };
}
