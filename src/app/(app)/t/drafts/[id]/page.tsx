import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getConversation, toUiMessages } from "@/lib/conversations";
import { quotaStatus } from "@/lib/quota";
import { DraftEditor } from "./DraftEditor";

export const metadata: Metadata = { title: "草稿" };

export default async function DraftPage({ params }: PageProps<"/t/drafts/[id]">) {
  const user = await requireUser(["teacher"]);
  const { id } = await params;
  const draft = db
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.id, id), eq(schema.drafts.ownerId, user.id)))
    .get();
  if (!draft) notFound();

  const conv = db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.draftId, id), eq(schema.conversations.userId, user.id)))
    .orderBy(desc(schema.conversations.updatedAt))
    .get();
  const found = conv ? getConversation(user.id, conv.id) : null;

  return (
    <DraftEditor
      key={draft.id}
      draft={{ id: draft.id, title: draft.title, type: draft.type, subject: draft.subject, content: draft.content, status: draft.status }}
      conversationId={found?.conv.id}
      messages={found ? toUiMessages(found.messages) : []}
      quotaExhausted={quotaStatus(user.id, user.role).exhausted}
    />
  );
}
