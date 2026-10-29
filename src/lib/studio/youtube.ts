import "server-only";

// Server-side YouTube metadata + caption fetch for Studio 影片重點. Best effort only: every step
// may fail (network, region, video without captions) and callers must work with whatever comes back.

export type CaptionLine = { start: number; text: string };
export type YoutubeInfo = {
  title?: string;
  author?: string;
  description?: string;
  lengthSeconds?: number;
  captions: CaptionLine[];
  captionLang?: string;
};

const TIMEOUT = 8_000;
// Innertube ANDROID client: its caption baseUrls are fetchable without the web client's PO token.
const ANDROID = { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" };
const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";
// Preferred caption languages, best first (school is zh-HK; English next).
const LANG_PREF = ["zh-HK", "yue", "zh-Hant", "zh-TW", "zh", "zh-Hans", "zh-CN", "en"];

type Track = { baseUrl: string; languageCode: string; kind?: string };

function timeoutSignal(parent?: AbortSignal) {
  const s = AbortSignal.timeout(TIMEOUT);
  return parent ? AbortSignal.any([parent, s]) : s;
}

function pickTrack(tracks: Track[]): Track | undefined {
  const score = (t: Track) => {
    const i = LANG_PREF.findIndex((l) => t.languageCode === l || t.languageCode.startsWith(`${l}-`));
    return (i === -1 ? LANG_PREF.length : i) * 2 + (t.kind === "asr" ? 1 : 0);
  };
  return [...tracks].sort((a, b) => score(a) - score(b))[0];
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Parses timedtext srv3 (`<p t="ms">`) or legacy (`<text start="s">`) XML. */
export function parseTimedText(xml: string): CaptionLine[] {
  const out: CaptionLine[] = [];
  for (const m of xml.matchAll(/<p\b[^>]*\bt="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = decode(m[2]);
    if (text) out.push({ start: Number(m[1]) / 1000, text });
  }
  if (out.length) return out;
  for (const m of xml.matchAll(/<text\b[^>]*\bstart="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const text = decode(m[2]);
    if (text) out.push({ start: Number(m[1]), text });
  }
  return out;
}

async function fromInnertube(videoId: string, signal?: AbortSignal): Promise<YoutubeInfo | null> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
    body: JSON.stringify({ context: { client: ANDROID }, videoId }),
    signal: timeoutSignal(signal),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    videoDetails?: { title?: string; author?: string; shortDescription?: string; lengthSeconds?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } };
  };
  const d = j.videoDetails ?? {};
  const info: YoutubeInfo = {
    title: d.title,
    author: d.author,
    description: d.shortDescription?.slice(0, 2000),
    lengthSeconds: Number(d.lengthSeconds) || undefined,
    captions: [],
  };
  const track = pickTrack(j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  if (track) {
    try {
      const cr = await fetch(track.baseUrl, { headers: { "User-Agent": ANDROID_UA }, signal: timeoutSignal(signal), cache: "no-store" });
      if (cr.ok) {
        info.captions = parseTimedText(await cr.text());
        info.captionLang = track.languageCode;
      }
    } catch {
      // captions are optional
    }
  }
  return info;
}

async function fromOembed(videoId: string, signal?: AbortSignal): Promise<YoutubeInfo | null> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  const res = await fetch(url, { signal: timeoutSignal(signal), cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; author_name?: string };
  return { title: j.title, author: j.author_name, captions: [] };
}

/** Never throws; returns an empty info object when nothing could be fetched. */
export async function fetchYoutubeInfo(videoId: string, signal?: AbortSignal): Promise<YoutubeInfo> {
  let info: YoutubeInfo | null = null;
  try {
    info = await fromInnertube(videoId, signal);
  } catch {
    info = null;
  }
  if (!info?.title) {
    try {
      const o = await fromOembed(videoId, signal);
      if (o) info = { ...o, ...info, title: o.title, author: info?.author ?? o.author, captions: info?.captions ?? [] };
    } catch {
      // metadata is optional
    }
  }
  return info ?? { captions: [] };
}

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** Merges caption lines into time windows so a long video fits the prompt: "[mm:ss] text" per line. */
export function captionsToTranscript(lines: CaptionLine[], maxChars = 20_000): string {
  if (!lines.length) return "";
  const total = lines[lines.length - 1].start || 1;
  const fullLen = lines.reduce((n, l) => n + l.text.length + 1, 0);
  // Window size grows with length; long transcripts are additionally trimmed per window.
  const windowSec = Math.max(15, Math.ceil(total / 120));
  const perWindow = Math.max(80, Math.floor((maxChars / Math.max(1, total / windowSec)) - 10));
  const out: string[] = [];
  let start = lines[0].start;
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    let text = buf.join(" ");
    if (fullLen > maxChars) text = text.slice(0, perWindow);
    out.push(`[${mmss(start)}] ${text}`);
    buf = [];
  };
  for (const l of lines) {
    if (l.start - start >= windowSec) {
      flush();
      start = l.start;
    }
    buf.push(l.text);
  }
  flush();
  return out.join("\n").slice(0, maxChars);
}
