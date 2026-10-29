"use server";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { featuresFor } from "@/lib/features";
import { newId } from "@/lib/ids";
import { translate, type DictKey } from "@/lib/i18n/dict";
import { createLibraryItem } from "@/lib/library";
import { runStructured } from "@/lib/ai/run";
import { essayPrompt, mockFeedback, normalizeFeedback } from "@/lib/ai/essay";
import { GENRES, wordCount } from "@/lib/essay";
import type { EssayFeedback } from "@/lib/db/schema";

export type EssayFields = { title: string; subject: string; genre: string; prompt: string; wordTarget: number; content: string };

async function ownEssay(id: string) {
  const user = await requireUser(["student"]);
  if (!featuresFor(user.role).essay) throw new Error("feature_off");
  const essay = db.select().from(schema.essays).where(and(eq(schema.essays.id, id), eq(schema.essays.studentId, user.id))).get();
  if (!essay) throw new Error("not_found");
  return { user, essay };
}

export async function createEssay() {
  const user = await requireUser(["student"]);
  const id = newId();
  db.insert(schema.essays).values({ id, studentId: user.id, title: translate(user.language, "es.untitled") }).run();
  // Essays are listed in "My files" too; the library row points back here.
  createLibraryItem({ ownerId: user.id, kind: "essay", source: "essay", title: translate(user.language, "es.untitled"), refId: id });
  return appRedirect(`/s/essay/${id}`);
}

export async function saveEssay(id: string, f: EssayFields) {
  const { user, essay } = await ownEssay(id);
  if (essay.status === "submitted") return; // locked while the teacher reviews it
  const title = f.title.trim().slice(0, 120) || essay.title;
  db.update(schema.essays)
    .set({
      title,
      subject: f.subject === "english" ? "english" : "chinese",
      genre: (GENRES as readonly string[]).includes(f.genre) ? f.genre : essay.genre,
      prompt: f.prompt.slice(0, 2000),
      wordTarget: Math.min(3000, Math.max(50, Math.round(f.wordTarget) || 400)),
      content: f.content.slice(0, 30_000),
      updatedAt: new Date(),
    })
    .where(eq(schema.essays.id, id))
    .run();
  const l = schema.libraryItems;
  db.update(l).set({ title, text: f.content.slice(0, 30_000), updatedAt: new Date() }).where(and(eq(l.ownerId, user.id), eq(l.kind, "essay"), eq(l.refId, id))).run();
  revalidatePath("/s/essay");
}

/** Save, run the rubric marker and store the result as a new version. */
export async function assessEssay(id: string, f: EssayFields): Promise<{ error?: DictKey; version?: number; feedback?: EssayFeedback }> {
  await saveEssay(id, f);
  const { user, essay } = await ownEssay(id);
  if (essay.status === "submitted") return { error: "es.submitted" };
  if (wordCount(essay.content) < 20) return { error: "es.tooShort" };
  const input = { title: essay.title, subject: essay.subject, genre: essay.genre, prompt: essay.prompt, wordTarget: essay.wordTarget, content: essay.content };
  const { system, prompt } = essayPrompt(input);
  const res = await runStructured({ user, source: "essay", input: essay.content, system, prompt, normalize: normalizeFeedback, mock: () => mockFeedback(input), refId: id });
  if (!res.ok) return { error: `p2.err.${res.error === "bad_output" || res.error === "upstream" ? "generic" : res.error}` as DictKey };

  const last = db.select({ v: schema.essayVersions.version }).from(schema.essayVersions).where(eq(schema.essayVersions.essayId, id)).orderBy(desc(schema.essayVersions.version)).limit(1).get();
  const version = (last?.v ?? 0) + 1;
  db.insert(schema.essayVersions).values({ id: newId(), essayId: id, version, content: essay.content, feedback: res.value }).run();
  db.update(schema.essays).set({ status: "ai_scored", updatedAt: new Date() }).where(eq(schema.essays.id, id)).run();
  revalidatePath(`/s/essay/${id}`);
  return { version, feedback: res.value };
}

export async function submitEssay(id: string, f: EssayFields) {
  await saveEssay(id, f);
  await ownEssay(id);
  db.update(schema.essays).set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() }).where(eq(schema.essays.id, id)).run();
  revalidatePath(`/s/essay/${id}`);
  revalidatePath("/s/essay");
}

export async function deleteEssay(id: string) {
  const { user } = await ownEssay(id);
  db.delete(schema.essays).where(eq(schema.essays.id, id)).run();
  const l = schema.libraryItems;
  db.delete(l).where(and(eq(l.ownerId, user.id), eq(l.kind, "essay"), eq(l.refId, id))).run();
  return appRedirect("/s/essay");
}
