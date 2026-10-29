import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const CHUNK = 800;
const OVERLAP = 120;
export const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv", ".html", ".htm", ".json", ".tex"];

export function isIndexable(filename: string) {
  const lower = filename.toLowerCase();
  // P2: PDF and Word are parsed by src/lib/extract.ts
  return [...TEXT_EXTENSIONS, ".pdf", ".docx"].some((ext) => lower.endsWith(ext));
}

export function toPlainText(filename: string, raw: string) {
  if (/\.html?$/i.test(filename)) {
    return raw
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ");
  }
  return raw;
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += CHUNK - OVERLAP) {
    const part = clean.slice(i, i + CHUNK).trim();
    if (part) out.push(part);
    if (i + CHUNK >= clean.length) break;
  }
  return out;
}

/** Latin words + CJK character bigrams; good enough for keyword retrieval across zh/en. */
function terms(s: string): Set<string> {
  const lower = s.toLowerCase();
  const set = new Set<string>();
  for (const w of lower.match(/[a-z0-9]{2,}/g) ?? []) set.add(w);
  const cjk = lower.match(/[㐀-鿿]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) set.add(run);
    for (let i = 0; i < run.length - 1; i++) set.add(run.slice(i, i + 2));
  }
  return set;
}

export function retrieve(tutorId: string, query: string, k = 4): string[] {
  const chunks = db.select().from(schema.tutorChunks).where(eq(schema.tutorChunks.tutorId, tutorId)).all();
  if (!chunks.length) return [];
  const q = terms(query);
  if (!q.size) return [];
  return chunks
    .map((c) => {
      const ct = terms(c.content);
      let score = 0;
      for (const t of q) if (ct.has(t)) score += t.length > 2 ? 2 : 1;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c.content);
}
