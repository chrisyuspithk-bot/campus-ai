import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { getClass } from "@/lib/p3/classes";
import type { Assignment, Attempt } from "@/lib/p3/exam";
import { gradeQuestions, studentMarks } from "./grading";

export type WrongItem = typeof schema.wrongItems.$inferSelect;
type NewWrong = Omit<typeof schema.wrongItems.$inferInsert, "id" | "studentId">;

export function listWrong(studentId: string) {
  return db.select().from(schema.wrongItems).where(eq(schema.wrongItems.studentId, studentId)).orderBy(desc(schema.wrongItems.createdAt)).all();
}

/** Add items, skipping questions (by bank id, else by stem) already in the book. Returns how many were added. */
export function addWrong(studentId: string, items: NewWrong[]) {
  const have = listWrong(studentId);
  let added = 0;
  for (const it of items) {
    const dup = have.find((w) => (it.questionId ? w.questionId === it.questionId : w.stem === it.stem));
    if (dup) {
      // Wrong again → back into the active list.
      if (dup.mastered) db.update(schema.wrongItems).set({ mastered: false, myAnswer: it.myAnswer ?? dup.myAnswer }).where(eq(schema.wrongItems.id, dup.id)).run();
      continue;
    }
    db.insert(schema.wrongItems).values({ ...it, id: newId(), studentId }).run();
    added++;
  }
  return added;
}

/** Questions the student lost marks on (graded or auto-marked). Upload-only homework is skipped. */
export function wrongQuestions(a: Assignment, att: Attempt) {
  const { marks } = studentMarks(a, att);
  const subject = getClass(a.classId)?.subject ?? "";
  return gradeQuestions(a)
    .filter((q) => q.id !== "_upload" && marks[q.id]?.score != null && marks[q.id].score! < q.marks)
    .map((q) => ({
      questionId: q.id,
      assignmentId: a.id,
      source: "assignment" as const,
      subject: q.subject || subject,
      topic: q.topic,
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      myAnswer: att.answers[q.id] ?? "",
    }));
}

export function recordRedo(studentId: string, id: string, correct: boolean) {
  const w = db.select().from(schema.wrongItems).where(and(eq(schema.wrongItems.id, id), eq(schema.wrongItems.studentId, studentId))).get();
  if (!w) return;
  db.update(schema.wrongItems)
    .set({ redoCount: w.redoCount + 1, redoCorrect: w.redoCorrect + (correct ? 1 : 0), mastered: correct, lastRedoAt: new Date() })
    .where(eq(schema.wrongItems.id, id))
    .run();
}
