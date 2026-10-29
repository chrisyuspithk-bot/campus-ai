"use server";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PaperSection } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { translate } from "@/lib/i18n/dict";

export async function createPaper() {
  const user = await requireUser(["teacher"]);
  const id = newId();
  db.insert(schema.papers)
    .values({ id, ownerId: user.id, title: translate(user.language, "pp.newTitle"), subject: user.group ?? "", sections: [{ title: user.language === "en" ? "Section A" : "一、選擇題", questionIds: [] }] })
    .run();
  return appRedirect(`/t/papers/${id}/edit`);
}

export type PaperPayload = { title: string; durationMin: number; shuffle: boolean; lockAi: boolean; sections: PaperSection[] };

export async function savePaper(id: string, p: PaperPayload): Promise<{ ok: boolean }> {
  const user = await requireUser(["teacher"]);
  const paper = db.select().from(schema.papers).where(and(eq(schema.papers.id, id), eq(schema.papers.ownerId, user.id))).get();
  if (!paper) return { ok: false };
  // Only keep questions the teacher may use (school bank or own), each once.
  const wanted = [...new Set(p.sections.flatMap((s) => s.questionIds))].slice(0, 200);
  const allowed = new Set(
    wanted.length
      ? db.select({ id: schema.questions.id }).from(schema.questions)
          .where(and(inArray(schema.questions.id, wanted), or(eq(schema.questions.scope, "school"), eq(schema.questions.ownerId, user.id))))
          .all().map((r) => r.id)
      : [],
  );
  const seen = new Set<string>();
  const sections = p.sections.slice(0, 20).map((s) => ({
    title: String(s.title ?? "").slice(0, 80),
    questionIds: s.questionIds.filter((q) => allowed.has(q) && !seen.has(q) && seen.add(q)),
  }));
  db.update(schema.papers)
    .set({
      title: String(p.title ?? "").trim().slice(0, 120) || paper.title,
      durationMin: Math.max(1, Math.min(600, Math.round(Number(p.durationMin)) || 45)),
      shuffle: !!p.shuffle,
      lockAi: !!p.lockAi,
      sections,
      updatedAt: new Date(),
    })
    .where(eq(schema.papers.id, id))
    .run();
  audit(user, "paper.save", p.title, `${seen.size} questions`);
  return { ok: true };
}

export async function deletePaper(form: FormData) {
  const user = await requireUser(["teacher"]);
  db.delete(schema.papers).where(and(eq(schema.papers.id, String(form.get("id") ?? "")), eq(schema.papers.ownerId, user.id))).run();
  return appRedirect("/t/papers");
}
