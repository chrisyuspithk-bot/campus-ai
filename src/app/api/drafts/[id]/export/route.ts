import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";

export async function GET(_req: Request, ctx: RouteContext<"/api/drafts/[id]/export">) {
  const user = await requireApiUser(["teacher"]);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const draft = db
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.id, id), eq(schema.drafts.ownerId, user.id)))
    .get();
  if (!draft) return Response.json({ error: "not_found" }, { status: 404 });
  if (draft.status === "draft") {
    db.update(schema.drafts).set({ status: "exported" }).where(eq(schema.drafts.id, id)).run();
  }
  const filename = `${draft.title.replace(/[\\/:*?"<>|]+/g, "_") || "draft"}.md`;
  return new Response(draft.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="draft.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
