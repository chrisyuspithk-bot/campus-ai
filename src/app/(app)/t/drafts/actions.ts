"use server";
import { and, eq } from "drizzle-orm";
import { appRedirect } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { newId } from "@/lib/ids";
import { translate } from "@/lib/i18n/dict";

import { DRAFT_TYPES, type DraftType } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { DOC_TYPES, draftDocument, type DocType } from "@/lib/p7/docs";

const TYPES: readonly DraftType[] = DRAFT_TYPES;

async function ownDraft(id: string) {
  const user = await requireUser(["teacher"]);
  const draft = db
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.id, id), eq(schema.drafts.ownerId, user.id)))
    .get();
  if (!draft) throw new Error("not_found");
  return { user, draft };
}

export async function createDraft() {
  const user = await requireUser(["teacher"]);
  const id = newId();
  db.insert(schema.drafts)
    .values({ id, ownerId: user.id, title: translate(user.language, "drafts.untitled"), type: "worksheet", subject: user.group ?? "" })
    .run();
  await appRedirect(`/t/drafts/${id}`);
}

export async function saveDraft(id: string, data: { title: string; type: string; subject: string; content: string }) {
  await ownDraft(id);
  db.update(schema.drafts)
    .set({
      title: data.title.trim().slice(0, 120) || "Untitled",
      type: TYPES.includes(data.type as DraftType) ? (data.type as DraftType) : "worksheet",
      subject: data.subject.trim().slice(0, 40),
      content: data.content.slice(0, 200_000),
      updatedAt: new Date(),
    })
    .where(eq(schema.drafts.id, id))
    .run();
  revalidatePath("/t/drafts");
  return { ok: true, savedAt: Date.now() };
}

export async function renameDraft(id: string, title: string) {
  await ownDraft(id);
  if (!title.trim()) return;
  db.update(schema.drafts).set({ title: title.trim().slice(0, 120), updatedAt: new Date() }).where(eq(schema.drafts.id, id)).run();
  revalidatePath("/t/drafts");
}

export async function duplicateDraft(id: string) {
  const { user, draft } = await ownDraft(id);
  db.insert(schema.drafts)
    .values({
      id: newId(),
      ownerId: user.id,
      title: draft.title + translate(user.language, "drafts.copySuffix"),
      type: draft.type,
      subject: draft.subject,
      content: draft.content,
    })
    .run();
  revalidatePath("/t/drafts");
}

export async function setDraftArchived(id: string, archived: boolean) {
  await ownDraft(id);
  db.update(schema.drafts).set({ status: archived ? "archived" : "draft", updatedAt: new Date() }).where(eq(schema.drafts.id, id)).run();
  revalidatePath("/t/drafts");
}

export async function deleteDraft(id: string, goToList = false) {
  await ownDraft(id);
  db.delete(schema.drafts).where(eq(schema.drafts.id, id)).run();
  revalidatePath("/t/drafts");
  if (goToList) await appRedirect("/t/drafts");
}

/** P7: 成績單 / 通知信 / 進度報告 — AI-filled from the picked class's numbers (template in demo mode). */
export async function createDocDraft(form: FormData) {
  const user = await requireUser(["teacher"]);
  const type = String(form.get("type") ?? "") as DocType;
  if (!DOC_TYPES.includes(type)) return appRedirect("/t/drafts");
  const classId = String(form.get("classId") ?? "");
  const topic = String(form.get("topic") ?? "");
  const r = await draftDocument(user, { type, classId, topic, school: getSetting("schoolName") });
  if (!r.ok) return appRedirect(`/t/drafts?err=${r.error}`);
  const id = newId();
  const label = translate(user.language, `drafts.type.${type}`);
  const title = r.value.title || [r.stats ? `${r.stats.className} ${r.stats.subject}` : "", label, topic.slice(0, 30)].filter(Boolean).join(" · ");
  db.insert(schema.drafts).values({ id, ownerId: user.id, title, type, subject: r.stats?.subject ?? user.group ?? "", content: r.value.content }).run();
  audit(user, "draft.ai", title, id);
  revalidatePath("/t/drafts");
  return appRedirect(`/t/drafts/${id}${r.mock ? "?mock=1" : ""}`);
}
