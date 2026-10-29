"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { RUBRIC, clampScore, gradeFor } from "@/lib/essay";
import type { RubricScores } from "@/lib/db/schema";

export async function returnEssay(form: FormData) {
  const user = await requireUser(["teacher"]);
  const id = String(form.get("id") ?? "");
  const e = db.select().from(schema.essays).where(eq(schema.essays.id, id)).get();
  if (!e || (e.status !== "submitted" && e.status !== "returned")) throw new Error("not_found");
  const scores = Object.fromEntries(RUBRIC.map((k) => [k, clampScore(form.get(k))])) as RubricScores;
  db.update(schema.essays)
    .set({
      status: "returned",
      teacherId: user.id,
      teacherScores: scores,
      teacherGrade: gradeFor(scores),
      teacherComment: String(form.get("comment") ?? "").slice(0, 4000),
      returnedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.essays.id, id))
    .run();
  audit(user, "essay.return", e.title, gradeFor(scores));
  revalidatePath("/t/grading/essay");
}
