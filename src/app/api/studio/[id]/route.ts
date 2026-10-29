import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ownStudioItem, studioUser } from "@/lib/studio/server";
import type { Flashcards, Mindmap, Quiz } from "@/lib/studio/types";

type Patch = {
  title?: string;
  positions?: Mindmap["positions"];
  mindmap?: Mindmap;
  progress?: { known: number[]; unknown: number[] };
  attempt?: { score: number; total: number };
  markdown?: string;
};

/** Save viewer state: node positions / edited map, flashcard progress, quiz attempts, worksheet edits, title. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/studio/[id]">) {
  const user = await studioUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const item = ownStudioItem(user.id, id);
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Patch;

  let data = item.data as Record<string, unknown>;
  if (item.kind === "mindmap" && body.mindmap?.root) data = { ...body.mindmap };
  if (item.kind === "mindmap" && body.positions) data = { ...data, positions: body.positions };
  if (item.kind === "flashcards" && body.progress) {
    const n = (data as Flashcards).cards.length;
    const clean = (a: number[]) => [...new Set(a.filter((i) => Number.isInteger(i) && i >= 0 && i < n))];
    data = { ...data, known: clean(body.progress.known ?? []), unknown: clean(body.progress.unknown ?? []) };
  }
  if (item.kind === "quiz" && body.attempt) {
    const attempts = [...((data as Quiz).attempts ?? []), { score: Math.max(0, Math.round(body.attempt.score)), total: Math.max(1, Math.round(body.attempt.total)), at: Date.now() }].slice(-20);
    data = { ...data, attempts };
  }
  if (item.kind === "worksheet" && typeof body.markdown === "string") data = { markdown: body.markdown.slice(0, 100_000) };

  db.update(schema.libraryItems)
    .set({ data, title: body.title?.trim() ? body.title.trim().slice(0, 120) : item.title, updatedAt: new Date() })
    .where(eq(schema.libraryItems.id, id))
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/studio/[id]">) {
  const user = await studioUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!ownStudioItem(user.id, id)) return Response.json({ error: "not_found" }, { status: 404 });
  db.delete(schema.libraryItems).where(eq(schema.libraryItems.id, id)).run();
  return Response.json({ ok: true });
}
