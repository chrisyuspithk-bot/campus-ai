"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { APP_TEMPLATES, getOwnApp, MAX_APP_BYTES, MAX_APPS_PER_TEACHER, myApps, type TemplateKey } from "@/lib/p6/apps";
import { orgCan } from "@/lib/p6/org";
import { vibeApp } from "@/lib/p7/vibe";
import { normalizeFiles, splitHtml, stitch, type ProjectFiles } from "@/lib/p8/files";

async function builder() {
  const user = await requireUser(["teacher"]);
  if (!orgCan(user.role, "apps.publish")) throw new Error("forbidden");
  return user;
}

async function own(id: string) {
  const user = await builder();
  const app = getOwnApp(id, user.id);
  if (!app) throw new Error("not_found");
  return { user, app };
}

export async function newApp(template: TemplateKey) {
  const user = await builder();
  if (myApps(user.id).length >= MAX_APPS_PER_TEACHER) return appRedirect("/t/apps?limit=1");
  const tpl = APP_TEMPLATES[template] ?? APP_TEMPLATES.blank;
  const id = newId();
  const files = splitHtml(tpl.html);
  db.insert(schema.appListings).values({ id, ownerId: user.id, title: tpl.title, emoji: tpl.emoji, description: tpl.description, subject: user.group === "英文" ? "英文" : "數學", html: stitch(files), files }).run();
  return appRedirect(`/t/apps/build/${id}`);
}

/** P8: `files` (html/css/js/data + blocks) is the source; `html` is the stitched single document that review/gallery run. */
export type AppFields = { title: string; emoji: string; description: string; subject: string; audience: "all" | "teacher"; html: string; files?: ProjectFiles };

function clean(f: AppFields) {
  const files = f.files ? normalizeFiles(f.files) : null;
  return {
    files,
    title: f.title.trim().slice(0, 60) || "App",
    emoji: [...f.emoji.trim()].slice(0, 2).join("") || "🧩",
    description: f.description.trim().slice(0, 200),
    subject: f.subject.slice(0, 20),
    audience: f.audience === "teacher" ? ("teacher" as const) : ("all" as const),
    html: files ? stitch(files) : String(f.html ?? ""),
  };
}

export async function saveApp(id: string, f: AppFields): Promise<{ error?: string }> {
  const { app } = await own(id);
  const c = clean(f);
  if (Buffer.byteLength(c.html) > MAX_APP_BYTES) return { error: "too_big" };
  // Any edit goes back to draft (and out of the review queue); a published snapshot keeps running until the new version passes review.
  db.update(schema.appListings).set({ ...c, status: "draft", updatedAt: new Date() }).where(eq(schema.appListings.id, app.id)).run();
  revalidatePath("/a/moderation");
  revalidatePath("/t/apps");
  return {};
}

/** 打包上架: snapshot is reviewed by an admin in /a/moderation. */
export async function submitApp(id: string, f: AppFields): Promise<{ error?: string; status?: string }> {
  const { user, app } = await own(id);
  const c = clean(f);
  if (Buffer.byteLength(c.html) > MAX_APP_BYTES) return { error: "too_big" };
  if (c.html.trim().length < 20 || !f.title.trim()) return { error: "empty" };
  db.update(schema.appListings).set({ ...c, status: "pending", reviewNote: "", submittedAt: new Date(), updatedAt: new Date() }).where(eq(schema.appListings.id, id)).run();
  audit(user, "app.submit", f.title || app.title);
  revalidatePath("/t/apps");
  revalidatePath("/a/moderation");
  return { status: "pending" };
}

export async function withdrawApp(id: string): Promise<{ status?: string }> {
  const { app } = await own(id);
  if (app.status !== "pending") return {};
  db.update(schema.appListings).set({ status: "draft", updatedAt: new Date() }).where(eq(schema.appListings.id, id)).run();
  revalidatePath("/a/moderation");
  return { status: "draft" };
}

export async function deleteApp(id: string) {
  const { user, app } = await own(id);
  db.delete(schema.appListings).where(eq(schema.appListings.id, id)).run();
  audit(user, "app.delete", app.title);
  return appRedirect("/t/apps");
}

/**
 * P7/P8: natural-language → files for the app builder. The result only lands in the working copy (draft) —
 * publishing still goes through /a/moderation. `error` = "用 AI 修" with the preview's error text.
 */
export async function vibeAppAction(
  id: string,
  instruction: string,
  current: string | ProjectFiles,
  error?: string,
): Promise<{ error?: string; reply?: string; code?: string; files?: ProjectFiles; mock?: boolean }> {
  const { user, app } = await own(id);
  const text = instruction.trim().slice(0, 1000);
  if (!text) return {};
  const files = typeof current === "string" ? (app.files && stitch(normalizeFiles(app.files)) === current ? normalizeFiles(app.files) : splitHtml(current)) : normalizeFiles(current);
  const res = await vibeApp(user, text, files, id, typeof error === "string" && error.trim() ? error.slice(0, 4000) : undefined);
  if (!res.ok) return { error: res.error };
  if (Buffer.byteLength(res.value.code) > MAX_APP_BYTES) return { error: "too_big" };
  db.update(schema.appListings).set({ html: res.value.code, files: res.value.files, status: "draft", updatedAt: new Date() }).where(eq(schema.appListings.id, app.id)).run();
  revalidatePath("/t/apps");
  return { reply: res.value.reply, code: res.value.code, files: res.value.files, mock: res.mock };
}
