import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { listQuestions } from "@/lib/p3/bank";
import { PaperEditor } from "./PaperEditor";

export const metadata: Metadata = { title: "組卷" };

export default async function EditPaper({ params }: PageProps<"/t/papers/[id]/edit">) {
  const user = await requireUser(["teacher"]);
  const { id } = await params;
  const paper = db.select().from(schema.papers).where(and(eq(schema.papers.id, id), eq(schema.papers.ownerId, user.id))).get();
  if (!paper) notFound();
  const bank = listQuestions(user.id).map((q) => ({
    id: q.id, code: q.code, subject: q.subject, topic: q.topic, type: q.type, difficulty: q.difficulty, marks: q.marks, stem: q.stem.slice(0, 160),
  }));
  return (
    <PaperEditor
      paper={{ id: paper.id, title: paper.title, subject: paper.subject, durationMin: paper.durationMin, shuffle: paper.shuffle, lockAi: paper.lockAi, sections: paper.sections }}
      bank={bank}
    />
  );
}
