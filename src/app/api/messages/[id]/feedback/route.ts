import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import { newId } from "@/lib/ids";

/** Thumbs up/down on an answer, or "report" on a blocked message (notifies teachers via the event log). */
export async function POST(req: Request, ctx: RouteContext<"/api/messages/[id]/feedback">) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const row = db
    .select({ id: schema.messages.id, conversationId: schema.messages.conversationId })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.messages.id, id), eq(schema.conversations.userId, user.id)))
    .get();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { value?: number | "report" };
  if (body.value === "report") {
    // "通知老師" on a blocked message: put it in the admin risk inbox with the student's own words.
    const lastUser = db
      .select({ content: schema.messages.content })
      .from(schema.messages)
      .where(and(eq(schema.messages.conversationId, row.conversationId), eq(schema.messages.role, "user"), eq(schema.messages.flag, "blocked")))
      .orderBy(desc(schema.messages.createdAt))
      .limit(1)
      .get();
    db.insert(schema.safetyCases)
      .values({
        id: newId(),
        userId: user.id,
        level: "high",
        category: "other",
        source: "report",
        matched: "student-report",
        excerpt: lastUser?.content.slice(0, 1200) ?? "",
        refId: row.conversationId,
      })
      .run();
    db.insert(schema.events).values({ type: "blocked", userId: user.id, detail: `reported:${id}` }).run();
  } else {
    const v = body.value === 1 ? 1 : body.value === -1 ? -1 : null;
    db.update(schema.messages).set({ feedback: v }).where(eq(schema.messages.id, id)).run();
  }
  return Response.json({ ok: true });
}
