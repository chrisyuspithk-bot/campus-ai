import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runStructured } from "@/lib/ai/run";
import {
  mockCards, mockMindmap, mockQuiz, mockWorksheet,
  normalizeCards, normalizeMindmap, normalizeQuiz, normalizeWorksheet, studioPrompt,
} from "@/lib/ai/studio";
import { createLibraryItem, getLibraryItem } from "@/lib/library";
import { aiFail, studioBase, studioUser } from "@/lib/studio/server";
import type { Mindmap } from "@/lib/studio/types";

type Body = { kind?: string; text?: string; libraryItemId?: string; draftId?: string; title?: string; count?: number };
const KINDS = ["mindmap", "flashcards", "quiz", "worksheet"] as const;
type Kind = (typeof KINDS)[number];

/** Source (upload / pasted text / library item / teacher draft) → mind map, flashcards, quiz or worksheet. Saved to the library. */
export async function POST(req: Request) {
  const user = await studioUser();
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as Body;
  const kind = body.kind as Kind;
  if (!KINDS.includes(kind) || (kind === "worksheet" && user.role !== "teacher")) {
    return Response.json({ error: "bad_kind" }, { status: 400 });
  }

  let text = (body.text ?? "").slice(0, 50_000).trim();
  let title = (body.title ?? "").trim();
  if (!text && body.libraryItemId) {
    const item = getLibraryItem(user.id, body.libraryItemId);
    if (!item) return Response.json({ error: "not_found" }, { status: 404 });
    text = item.text;
    title ||= item.title.replace(/\.[a-z0-9]+$/i, "");
    if (!text && !item.mime?.startsWith("image/")) return Response.json({ error: "no_text" }, { status: 400 });
  }
  if (!text && body.draftId && user.role === "teacher") {
    const d = db.select().from(schema.drafts).where(and(eq(schema.drafts.id, body.draftId), eq(schema.drafts.ownerId, user.id))).get();
    if (!d) return Response.json({ error: "not_found" }, { status: 404 });
    text = d.content;
    title ||= d.title;
  }
  const count = Math.min(20, Math.max(3, Number(body.count) || (kind === "quiz" ? 6 : 12)));
  const { system, prompt } = studioPrompt(kind, text, { teacher: user.role === "teacher", count });

  const common = { user, source: "studio" as const, input: text, system, prompt, signal: req.signal };
  const res =
    kind === "mindmap"
      ? await runStructured({ ...common, normalize: normalizeMindmap, mock: () => mockMindmap(text, title) })
      : kind === "flashcards"
        ? await runStructured({ ...common, normalize: normalizeCards, mock: () => mockCards(text) })
        : kind === "quiz"
          ? await runStructured({ ...common, normalize: normalizeQuiz, mock: () => mockQuiz(text, count) })
          : await runStructured({ ...common, normalize: normalizeWorksheet, mock: () => mockWorksheet(text, title) });
  if (!res.ok) return aiFail(res.error, res.message);

  if (!title) title = kind === "mindmap" ? (res.value as Mindmap).root.label : text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 40);
  const id = createLibraryItem({ ownerId: user.id, kind, source: "studio", title: title || kind, data: res.value, text });
  return Response.json({ id, kind, href: `${studioBase(user)}/${kind}/${id}`, mock: res.mock });
}
