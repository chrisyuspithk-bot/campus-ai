import type { InkItem } from "@/lib/db/schema";

export const INK_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#111827"];
export const STAMPS = ["✓", "✗", "優", "閱", "★", "?"];

const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 10) / 10)) : lo;
};
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : INK_COLORS[0]);

/** Validate an untrusted ink layer (client payload) — only known page ids, bounded sizes. */
export function sanitizeInk(raw: unknown, pageIds: string[]): Record<string, InkItem[]> {
  const out: Record<string, InkItem[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const pid of pageIds) {
    const list = (raw as Record<string, unknown>)[pid];
    if (!Array.isArray(list)) continue;
    const items: InkItem[] = [];
    for (const it of list.slice(0, 400) as Record<string, unknown>[]) {
      if (!it || typeof it !== "object") continue;
      if (it.t === "pen" && Array.isArray(it.p)) {
        const p = (it.p as unknown[]).slice(0, 2000).map((v) => num(v, 0, 3000));
        if (p.length >= 4) items.push({ t: "pen", c: color(it.c), w: num(it.w, 1, 20), p: p.length % 2 ? p.slice(0, -1) : p });
      } else if ((it.t === "text" || it.t === "stamp") && typeof it.s === "string" && it.s.trim()) {
        items.push({ t: it.t, c: color(it.c), x: num(it.x, 0, 1000), y: num(it.y, 0, 3000), s: it.s.slice(0, it.t === "stamp" ? 4 : 200) });
      }
    }
    out[pid] = items;
  }
  return out;
}

/** SVG path for a pen stroke (flat x,y list). */
export function strokePath(p: number[]) {
  let d = "";
  for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? "L" : "M"}${p[i]} ${p[i + 1]}`;
  return d;
}
