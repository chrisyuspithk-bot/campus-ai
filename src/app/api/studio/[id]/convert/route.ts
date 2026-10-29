import { runStructured } from "@/lib/ai/run";
import { mockQuiz, normalizeQuiz, studioPrompt } from "@/lib/ai/studio";
import { createLibraryItem } from "@/lib/library";
import { aiFail, ownStudioItem, studioBase, studioUser } from "@/lib/studio/server";
import { mindmapToCards, type Flashcards, type Mindmap } from "@/lib/studio/types";

/**
 * mind map → flashcards (local, no AI) · flashcards (weak ones) → practice quiz (AI).
 * Both create a new library item and return where to open it.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/studio/[id]/convert">) {
  const user = await studioUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const item = ownStudioItem(user.id, id);
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });
  const { to, only } = (await req.json().catch(() => ({}))) as { to?: string; only?: number[] };
  const base = studioBase(user);

  if (item.kind === "mindmap" && to === "flashcards") {
    const cards = mindmapToCards(item.data as Mindmap);
    if (!cards.length) return Response.json({ error: "no_cards" }, { status: 400 });
    const nid = createLibraryItem({ ownerId: user.id, kind: "flashcards", source: "studio", title: item.title, data: { cards }, text: item.text });
    return Response.json({ id: nid, href: `${base}/flashcards/${nid}` });
  }

  if ((item.kind === "flashcards" || item.kind === "mindmap") && to === "quiz") {
    const all = item.kind === "flashcards" ? (item.data as Flashcards).cards : mindmapToCards(item.data as Mindmap);
    const picked = Array.isArray(only) && only.length ? all.filter((_, i) => only.includes(i)) : all;
    // Pad with other cards so there are enough distractors for multiple choice.
    const pool = picked.length >= 4 ? picked : [...picked, ...all.filter((c) => !picked.includes(c))].slice(0, Math.max(4, picked.length));
    const text = pool.map((c) => `${c.front}：${c.back}`).join("\n");
    const count = Math.min(10, Math.max(3, picked.length));
    const { system, prompt } = studioPrompt("quiz", text, { teacher: user.role === "teacher", count });
    const res = await runStructured({ user, source: "studio", input: text, system, prompt, normalize: normalizeQuiz, mock: () => mockQuiz(text, count), signal: req.signal });
    if (!res.ok) return aiFail(res.error, res.message);
    const nid = createLibraryItem({ ownerId: user.id, kind: "quiz", source: "studio", title: item.title, data: res.value, text });
    return Response.json({ id: nid, href: `${base}/quiz/${nid}` });
  }
  return Response.json({ error: "bad_conversion" }, { status: 400 });
}
