import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";

async function owned(id: string) {
  const user = await requireApiUser();
  if (user instanceof Response) return { error: user };
  const conv = db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.id)))
    .get();
  if (!conv) return { error: Response.json({ error: "not_found" }, { status: 404 }) };
  return { conv };
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const { conv, error } = await owned(id);
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    pinned?: boolean;
    modelId?: string;
    tools?: Record<string, boolean>;
  };
  const set: Partial<typeof schema.conversations.$inferInsert> = {};
  if (typeof body.title === "string" && body.title.trim() && !conv.tutorId) set.title = body.title.trim().slice(0, 80);
  if (typeof body.pinned === "boolean") set.pinned = body.pinned;
  if (typeof body.modelId === "string") set.modelId = body.modelId;
  if (body.tools && typeof body.tools === "object") {
    set.tools = {
      rag: Boolean(body.tools.rag),
      search: Boolean(body.tools.search),
      image: Boolean(body.tools.image),
      tts: Boolean(body.tools.tts),
    };
  }
  if (Object.keys(set).length && !conv.archived) {
    db.update(schema.conversations).set(set).where(eq(schema.conversations.id, id)).run();
  }
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const { error } = await owned(id);
  if (error) return error;
  db.delete(schema.conversations).where(eq(schema.conversations.id, id)).run();
  return Response.json({ ok: true });
}
