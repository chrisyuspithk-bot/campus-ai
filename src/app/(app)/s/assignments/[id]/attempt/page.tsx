import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { attemptDeadline, examQuestions, findAttempt, getAssignment, settleAttempt, studentCanAccess } from "@/lib/p3/exam";
import { ExamClient } from "./ExamClient";

export const metadata: Metadata = { title: "考試作答" };

/** Full-screen exam shell (AppShell drops nav + AI on this route). Answers / marking notes never reach the client. */
export default async function AttemptPage({ params }: PageProps<"/s/assignments/[id]/attempt">) {
  const user = await requireUser(["student"]);
  const { id } = await params;
  const a = getAssignment(id);
  if (!studentCanAccess(a, user.id)) notFound();
  const found = findAttempt(a.id, user.id);
  if (!found) return appRedirect(`/s/assignments/${a.id}`);
  const att = settleAttempt(found, a);
  if (att.status !== "in_progress") return appRedirect(a.allowReview ? `/s/assignments/${a.id}/result` : `/s/assignments/${a.id}`);

  return (
    <ExamClient
      assignment={{ id: a.id, title: a.title, lockAi: a.lockAi, timed: !!a.durationMin }}
      attemptId={att.id}
      deadline={attemptDeadline(a, att)}
      serverNow={Date.now()}
      questions={examQuestions(a, att.id)}
      initialAnswers={att.answers}
      initialBlur={att.blurCount}
      savedAt={att.savedAt?.getTime() ?? 0}
    />
  );
}
