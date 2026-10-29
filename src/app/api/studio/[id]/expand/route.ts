import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runStructured } from "@/lib/ai/run";
import { expandPrompt, mockExpand, normalizeExpand } from "@/lib/ai/studio";
import { aiFail, ownStudioItem, studioUser } from "@/lib/studio/server";
import { walk, type MindNode, type Mindmap } from "@/lib/studio/types";

/** Right-column AI on a mind map: "加分枝：粒線體" → new nodes attached to the best-matching parent. */
export async function POST(req: Request, ctx: RouteContext<"/api/studio/[id]/expand">) {
  const user = await studioUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const item = ownStudioItem(user.id, id);
  if (!item || item.kind !== "mindmap") return Response.json({ error: "not_found" }, { status: 404 });
  const { instruction } = (await req.json().catch(() => ({}))) as { instruction?: string };
  const text = (instruction ?? "").trim().slice(0, 500);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });

  const map = item.data as Mindmap;
  const { system, prompt } = expandPrompt(map, text);
  const res = await runStructured({ user, source: "studio", input: text, system, prompt, normalize: normalizeExpand, mock: () => mockExpand(map, text), refId: id, signal: req.signal });
  if (!res.ok) return aiFail(res.error, res.message);

  let parent: MindNode = map.root;
  walk(map.root, (n) => {
    if (n.label.toLowerCase() === res.value.parent.toLowerCase()) parent = n;
  });
  parent.children.push(...res.value.nodes);
  db.update(schema.libraryItems).set({ data: map, updatedAt: new Date() }).where(eq(schema.libraryItems.id, id)).run();
  return Response.json({ mindmap: map, added: res.value.nodes.map((n) => n.label), parent: parent.label });
}
