import "server-only";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
/** Multimodal user content (P5 handwriting recognition). */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type VisionMessage = { role: "system" | "user"; content: string | ContentPart[] };
export type Citation = { url: string; title: string };
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  /** P7: web-plugin sources (OpenRouter `url_citation` annotations) */
  | { type: "citations"; citations: Citation[] };

type Annotation = { type?: string; url_citation?: { url?: string; title?: string } };

/** Unique url_citation annotations → citations. */
export function citationsOf(annotations: unknown): Citation[] {
  if (!Array.isArray(annotations)) return [];
  const out = new Map<string, Citation>();
  for (const a of annotations as Annotation[]) {
    const url = a?.url_citation?.url;
    if (typeof url === "string" && /^https?:\/\//.test(url) && !out.has(url)) out.set(url, { url, title: (a.url_citation?.title || url).slice(0, 140) });
  }
  return [...out.values()].slice(0, 8);
}

/** Markdown "sources" footer appended to web-search replies. */
export function citationsMarkdown(c: Citation[], lang: "zh" | "en" = "zh") {
  if (!c.length) return "";
  const clean = (s: string) => s.replace(/[[\]\n]/g, " ").trim();
  return `\n\n---\n**${lang === "zh" ? "來源" : "Sources"}**\n${c.map((x, i) => `${i + 1}. [${clean(x.title)}](${x.url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20")})`).join("\n")}`;
}

const BASE = process.env.OPENROUTER_BASE_URL?.replace(/\/$/, "") || "https://openrouter.ai/api/v1";

export function hasOpenRouterKey() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "Campus AI",
  };
}

async function errorText(res: Response) {
  const body = await res.text().catch(() => "");
  try {
    const j = JSON.parse(body);
    return j?.error?.message ?? body.slice(0, 200);
  } catch {
    return body.slice(0, 200) || res.statusText;
  }
}

/** Streams an OpenRouter chat completion (SSE) as text + final usage events. */
export async function* streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  webSearch?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      usage: { include: true },
      ...(opts.webSearch ? { plugins: [{ id: "web", max_results: 4 }] } : {}),
    }),
  });
  if (!res.ok || !res.body) throw new Error(`OpenRouter ${res.status}: ${await errorText(res)}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // skip ": OPENROUTER PROCESSING" keep-alives
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let json: {
        error?: { message?: string };
        choices?: { delta?: { content?: string; annotations?: unknown } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error.message ?? "stream error");
      const text = json.choices?.[0]?.delta?.content;
      if (text) yield { type: "text", text };
      const cites = citationsOf(json.choices?.[0]?.delta?.annotations);
      if (cites.length) yield { type: "citations", citations: cites };
      if (json.usage) {
        yield {
          type: "usage",
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}

/** Non-streaming image generation via an image-output model. Returns markdown. */
export async function generateImage(opts: { model: string; prompt: string; signal?: AbortSignal }) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await errorText(res)}`);
  const json = await res.json();
  const msg = json?.choices?.[0]?.message ?? {};
  const images: string[] = (msg.images ?? [])
    .map((i: { image_url?: { url?: string } }) => i.image_url?.url)
    .filter(Boolean);
  const text: string = typeof msg.content === "string" ? msg.content : "";
  const md = [text, ...images.map((u, i) => `![image ${i + 1}](${u})`)].filter(Boolean).join("\n\n");
  return {
    markdown: md || "(no image returned)",
    imageCount: images.length,
    tokens: (json?.usage?.prompt_tokens ?? 0) + (json?.usage?.completion_tokens ?? 0),
  };
}

/** Non-streaming completion, used by P2 tools that need structured (JSON) output. */
export async function completeChat(opts: {
  model: string;
  messages: ChatMessage[] | VisionMessage[];
  json?: boolean;
  /** P7: OpenRouter web plugin (research) */
  webSearch?: boolean;
  signal?: AbortSignal;
}): Promise<{ text: string; tokens: number; citations: Citation[] }> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.webSearch ? { plugins: [{ id: "web", max_results: 4 }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await errorText(res)}`);
  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  const tokens = (json?.usage?.prompt_tokens ?? 0) + (json?.usage?.completion_tokens ?? 0);
  return { text, tokens: tokens || Math.ceil((JSON.stringify(opts.messages).length + text.length) / 3), citations: citationsOf(json?.choices?.[0]?.message?.annotations) };
}
