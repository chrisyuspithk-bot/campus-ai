import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { ChatDisabled } from "@/components/chat/ChatDisabled";
import { ExamLocked } from "@/components/ExamLocked";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { loadConversation, loadNewChat } from "../../load";

export const metadata: Metadata = { title: "AI" };

export default async function ConversationPage({ params, searchParams }: PageProps<"/ai/c/[id]">) {
  const user = await requireUser();
  const lock = user.role === "student" ? activeLockedAttempt(user.id) : null;
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const { id } = await params;
  const sp = await searchParams;
  const res =
    id === "new"
      ? loadNewChat(user, { ctx: typeof sp.ctx === "string" ? sp.ctx.slice(0, 200) : undefined })
      : loadConversation(user, id);
  if (res.kind === "notFound") notFound();
  if (res.kind === "disabled") return <ChatDisabled />;
  return <ChatWorkspace key={id} {...res.props} />;
}
