"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { featuresFor } from "@/lib/features";
import { newId } from "@/lib/ids";
import { runStructured } from "@/lib/ai/run";
import type { VideoScene, VideoStatus } from "@/lib/db/schema";
import { orgCan } from "@/lib/p6/org";
import { keyPointsFrom, mockScript, mockStoryboard, normalizeScenes, normalizeScript, normalizeStoryboard, scriptPrompt, storyboardPrompt, totalSeconds } from "@/lib/p6/media";

async function mediaUser() {
  const user = await requireUser(["teacher", "admin"]);
  if (!featuresFor(user.role).media || !orgCan(user.role, "media.create")) throw new Error("feature_off");
  return user;
}

async function ownVideo(id: string) {
  const user = await mediaUser();
  const v = db.select().from(schema.videos).where(and(eq(schema.videos.id, id), eq(schema.videos.ownerId, user.id))).get();
  if (!v) throw new Error("not_found");
  return { user, v };
}

const touch = (id: string, set: Partial<typeof schema.videos.$inferInsert>) => {
  db.update(schema.videos).set({ ...set, updatedAt: new Date() }).where(eq(schema.videos.id, id)).run();
  revalidatePath("/t/media");
};

export async function createVideo(form: FormData) {
  const user = await mediaUser();
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  if (!title) return;
  const id = newId();
  db.insert(schema.videos)
    .values({
      id,
      ownerId: user.id,
      title,
      subject: String(form.get("subject") ?? "").slice(0, 20) || "數學",
      topic: String(form.get("topic") ?? "").trim().slice(0, 40),
      level: String(form.get("level") ?? "").slice(0, 4),
      script: String(form.get("script") ?? "").slice(0, 6000),
    })
    .run();
  audit(user, "media.create", title);
  return appRedirect(`/t/media/${id}`);
}

type R = { error?: string; script?: string; scenes?: VideoScene[]; keyPoints?: string[]; status?: VideoStatus; mock?: boolean; renderInfo?: string };

export async function saveMeta(id: string, fields: { title: string; subject: string; topic: string; level: string }): Promise<R> {
  const { v } = await ownVideo(id);
  touch(v.id, { title: fields.title.trim().slice(0, 80) || v.title, subject: fields.subject.slice(0, 20) || v.subject, topic: fields.topic.trim().slice(0, 40), level: fields.level.slice(0, 4) });
  return {};
}

export async function saveScript(id: string, script: string): Promise<R> {
  const { v } = await ownVideo(id);
  touch(v.id, { script: script.slice(0, 6000) });
  return {};
}

/** Step 1 → AI (or offline) narration script from the title/topic. */
export async function generateScript(id: string): Promise<R> {
  const { user, v } = await ownVideo(id);
  const { system, prompt } = scriptPrompt(v);
  const res = await runStructured({ user, source: "media", input: `${v.title} ${v.topic}`, system, prompt, normalize: normalizeScript, mock: () => mockScript(v), refId: id });
  if (!res.ok) return { error: res.error };
  touch(v.id, { script: res.value.script });
  return { script: res.value.script, mock: res.mock };
}

/** Step 2: script → storyboard scenes + key points. */
export async function generateStoryboard(id: string, script: string): Promise<R> {
  const { user, v } = await ownVideo(id);
  const text = script.trim().slice(0, 6000);
  if (text.length < 10) return { error: "empty" };
  const { system, prompt } = storyboardPrompt(text);
  const res = await runStructured({ user, source: "media", input: text, system, prompt, normalize: normalizeStoryboard, mock: () => mockStoryboard(text, v.topic), refId: id });
  if (!res.ok) return { error: res.error };
  const status: VideoStatus = v.status === "published" ? "published" : "storyboard";
  touch(v.id, { script: text, scenes: res.value.scenes, keyPoints: res.value.keyPoints, status });
  return { scenes: res.value.scenes, keyPoints: res.value.keyPoints, status, mock: res.mock };
}

export async function saveStoryboard(id: string, scenes: VideoScene[], keyPoints: string[]): Promise<R> {
  const { v } = await ownVideo(id);
  const clean = normalizeScenes(scenes);
  const kp = keyPoints.map((k) => k.trim().slice(0, 160)).filter(Boolean).slice(0, 6);
  touch(v.id, { scenes: clean, keyPoints: kp.length ? kp : keyPointsFrom(clean), status: v.status === "script" && clean.length ? "storyboard" : v.status });
  return { scenes: clean, keyPoints: kp };
}

/**
 * Step 3: "render" a short-video draft. No video pipeline is configured on this server, so the draft is the
 * timed storyboard player (scenes + captions + browser TTS); renderInfo records that it is a mock render.
 */
export async function renderDraft(id: string): Promise<R> {
  const { user, v } = await ownVideo(id);
  if (v.scenes.length < 2) return { error: "no_scenes" };
  await new Promise((r) => setTimeout(r, 900));
  const renderInfo = `mock · ${v.scenes.length} scenes · ${totalSeconds(v.scenes)}s · 1280×720 storyboard player`;
  const status: VideoStatus = v.status === "published" ? "published" : "draft";
  touch(v.id, { status, renderInfo, renderedAt: new Date() });
  audit(user, "media.render", v.title, renderInfo);
  return { status, renderInfo };
}

export async function publishVideo(id: string, publish: boolean): Promise<R> {
  const { user, v } = await ownVideo(id);
  if (publish && !v.renderedAt) return { error: "not_rendered" };
  const status: VideoStatus = publish ? "published" : "draft";
  touch(v.id, { status, publishedAt: publish ? new Date() : v.publishedAt });
  audit(user, publish ? "media.publish" : "media.unpublish", v.title);
  revalidatePath("/s/videos");
  return { status };
}

export async function deleteVideo(id: string) {
  const { user, v } = await ownVideo(id);
  db.delete(schema.videos).where(eq(schema.videos.id, v.id)).run();
  audit(user, "media.delete", v.title);
  return appRedirect("/t/media");
}
