import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { ChatDisabled } from "@/components/chat/ChatDisabled";
import { ExamLocked } from "@/components/ExamLocked";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { loadNewChat } from "./load";

export const metadata: Metadata = { title: "AI" };

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const user = await requireUser();
  const lock = user.role === "student" ? activeLockedAttempt(user.id) : null;
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const sp = await searchParams;
  const tutorSlug = typeof sp.tutor === "string" ? sp.tutor : undefined;
  const preview = sp.preview === "1";
  const nonce = typeof sp.n === "string" ? sp.n : "";
  const res = loadNewChat(user, { tutorSlug, preview });
  if (res.kind === "notFound") notFound();
  if (res.kind === "disabled") return <ChatDisabled />;
  return <ChatWorkspace key={`${tutorSlug ?? ""}:${nonce}`} {...res.props} />;
}
