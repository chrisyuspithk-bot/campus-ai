import "server-only";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type ConversationSummary = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  tutorEmoji: string | null;
  isDraft: boolean;
  updatedAt: number;
};

/** History list for the sidebar; teacher tutor previews are excluded. */
export function listConversations(userId: string, q = "", limit = 100): ConversationSummary[] {
  const c = schema.conversations;
  const term = q.trim();
  const base = and(eq(c.userId, userId), eq(c.preview, false));
  const where = term
    ? and(
        base,
        or(
          like(c.title, `%${term}%`),
          // Match message content too ("搜歷史")
          like(
            schema.messages.content,
            `%${term}%`,
          ),
        ),
      )
    : base;
  const q1 = db
    .selectDistinct({
      id: c.id,
      title: c.title,
      pinned: c.pinned,
      archived: c.archived,
      tutorEmoji: schema.tutors.emoji,
      draftId: c.draftId,
      updatedAt: c.updatedAt,
    })
    .from(c)
    .leftJoin(schema.tutors, eq(schema.tutors.id, c.tutorId));
  const rows = (term ? q1.leftJoin(schema.messages, eq(schema.messages.conversationId, c.id)) : q1)
    .where(where)
    .orderBy(desc(c.pinned), desc(c.updatedAt))
    .limit(limit)
    .all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    pinned: r.pinned,
    archived: r.archived,
    tutorEmoji: r.tutorEmoji,
    isDraft: Boolean(r.draftId),
    updatedAt: r.updatedAt.getTime(),
  }));
}

export function getConversation(userId: string, id: string) {
  const conv = db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
    .get();
  if (!conv) return null;
  const msgs = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id))
    .orderBy(asc(schema.messages.createdAt), asc(sql`${schema.messages}.rowid`))
    .all();
  return { conv, messages: msgs };
}

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedback: number | null;
  blocked: boolean;
};

export function toUiMessages(rows: (typeof schema.messages.$inferSelect)[]): UiMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    // Never send blocked user text back to the client UI beyond what they typed.
    content: m.content,
    feedback: m.feedback,
    blocked: m.flag === "blocked",
  }));
}
