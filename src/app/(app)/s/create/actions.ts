"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { featuresFor } from "@/lib/features";
import { newId } from "@/lib/ids";
import { translate, type DictKey } from "@/lib/i18n/dict";
import { createLibraryItem } from "@/lib/library";
import { runStructured } from "@/lib/ai/run";
import { createPrompt, mockCreate, normalizeCreate } from "@/lib/ai/create";
import type { CreateKind, CreateMessage } from "@/lib/db/schema";
import { orgCan } from "@/lib/p6/org";
import { vibeCode } from "@/lib/p7/vibe";
import { emptyFiles, normalizeFiles, type ProjectFiles } from "@/lib/p8/files";

const CODE_STARTER = `// 🧪 代碼沙盒：JavaScript 喺你部機嘅隔離沙盒入面行（限時 3 秒、無網絡）
// 用 console.log() 輸出結果。

function factorPairs(c) {
  const out = [];
  for (let p = -Math.abs(c); p <= Math.abs(c); p++) {
    if (p !== 0 && c % p === 0) out.push([p, c / p]);
  }
  return out;
}

// x² − 5x + 6：搵 p × q = 6 而 p + q = −5
const pair = factorPairs(6).find(([p, q]) => p + q === -5);
console.log("p, q =", pair);
console.log(\`x² − 5x + 6 = (x \${pair[0] < 0 ? "−" : "+"} \${Math.abs(pair[0])})(x \${pair[1] < 0 ? "−" : "+"} \${Math.abs(pair[1])})\`);
`;

const KINDS: CreateKind[] = ["poster", "webpage", "slides", "code"];

async function ownProject(id: string) {
  const user = await requireUser(["student"]);
  if (!featuresFor(user.role).create) throw new Error("feature_off");
  const p = db.select().from(schema.createProjects).where(and(eq(schema.createProjects.id, id), eq(schema.createProjects.ownerId, user.id))).get();
  if (!p) throw new Error("not_found");
  return { user, p };
}

export async function createProject(kind: CreateKind) {
  const user = await requireUser(["student"]);
  if (kind === "code" && !orgCan(user.role, "create.sandbox")) throw new Error("forbidden");
  const id = newId();
  db.insert(schema.createProjects)
    .values({ id, ownerId: user.id, kind: KINDS.includes(kind) ? kind : "poster", title: translate(user.language, kind === "code" ? "p6.cr.untitledCode" : "cr.untitled"), html: kind === "code" ? CODE_STARTER : "" })
    .run();
  return appRedirect(`/s/create/${id}`);
}

/** One chat turn: the model returns a reply plus the full updated HTML for the preview. */
export async function sendCreate(id: string, message: string): Promise<{ error?: DictKey; messages?: CreateMessage[]; html?: string; title?: string }> {
  const { user, p } = await ownProject(id);
  const text = message.trim().slice(0, 2000);
  if (!text) return {};
  const { system, prompt } = createPrompt(p.kind, p.messages, p.html, text);
  const res = await runStructured({ user, source: "create", input: text, system, prompt, normalize: normalizeCreate, mock: () => mockCreate(p.kind, p.messages, text, p.title), refId: id });
  if (!res.ok) return { error: `p2.err.${res.error === "bad_output" || res.error === "upstream" ? "generic" : res.error}` as DictKey };
  const messages: CreateMessage[] = [...p.messages, { role: "user" as const, content: text }, { role: "assistant" as const, content: res.value.reply }].slice(-40);
  const untitled = p.title === translate(user.language, "cr.untitled");
  const title = untitled && res.value.title ? res.value.title : p.title;
  db.update(schema.createProjects).set({ messages, html: res.value.html, title, updatedAt: new Date() }).where(eq(schema.createProjects.id, id)).run();
  const l = schema.libraryItems;
  db.update(l).set({ title, updatedAt: new Date() }).where(and(eq(l.ownerId, user.id), eq(l.kind, "create"), eq(l.refId, id))).run();
  return { messages, html: res.value.html, title };
}

/** "分享到檔案庫": add (once) to My files. */
export async function shareProject(id: string) {
  const { user, p } = await ownProject(id);
  const l = schema.libraryItems;
  const existing = db.select({ id: l.id }).from(l).where(and(eq(l.ownerId, user.id), eq(l.kind, "create"), eq(l.refId, id))).get();
  if (existing) db.update(l).set({ title: p.title, updatedAt: new Date() }).where(eq(l.id, existing.id)).run();
  else createLibraryItem({ ownerId: user.id, kind: "create", source: "create", title: p.title, refId: id });
  revalidatePath("/s/library");
}

export async function deleteProject(id: string) {
  const { user } = await ownProject(id);
  db.delete(schema.createProjects).where(eq(schema.createProjects.id, id)).run();
  const l = schema.libraryItems;
  db.delete(l).where(and(eq(l.ownerId, user.id), eq(l.kind, "create"), eq(l.refId, id))).run();
  return appRedirect("/s/create");
}

/** Current files of a code project (P8 multi-file; legacy rows only have the JS in `html`). */
function projectFiles(p: { html: string; files: ProjectFiles | null }) {
  return p.files ? normalizeFiles(p.files, p.html) : emptyFiles(p.html);
}

/** P6 code sandbox: save the project (runs only in the browser sandbox, never on the server). P8: `code` may be the multi-file project. */
export async function saveCode(id: string, code: string | ProjectFiles, title: string) {
  const { user, p } = await ownProject(id);
  if (p.kind !== "code") throw new Error("not_found");
  const t = title.trim().slice(0, 80) || p.title;
  const files = typeof code === "string" ? { ...projectFiles(p), js: code.slice(0, 50_000) } : normalizeFiles(code);
  db.update(schema.createProjects).set({ html: files.js, files, title: t, updatedAt: new Date() }).where(eq(schema.createProjects.id, id)).run();
  const l = schema.libraryItems;
  db.update(l).set({ title: t, updatedAt: new Date() }).where(and(eq(l.ownerId, user.id), eq(l.kind, "create"), eq(l.refId, id))).run();
  revalidatePath("/s/create");
}

/**
 * P7/P8: natural-language → code for the sandbox (never executed on the server). `error` = P8 "用 AI 修": the
 * sandbox's error / timeout text is sent with the files so the model can repair them.
 */
export async function vibeCodeAction(
  id: string,
  instruction: string,
  code: string | ProjectFiles,
  error?: string,
): Promise<{ error?: DictKey; reply?: string; code?: string; files?: ProjectFiles; mock?: boolean }> {
  const { user, p } = await ownProject(id);
  if (p.kind !== "code" || !orgCan(user.role, "create.sandbox")) throw new Error("forbidden");
  const text = instruction.trim().slice(0, 1000);
  if (!text) return {};
  const current = typeof code === "string" ? { ...projectFiles(p), js: code.slice(0, 50_000) } : normalizeFiles(code);
  const res = await vibeCode(user, text, current, id, typeof error === "string" && error.trim() ? error.slice(0, 4000) : undefined);
  if (!res.ok) return { error: `p2.err.${res.error === "bad_output" || res.error === "upstream" ? "generic" : res.error}` as DictKey };
  db.update(schema.createProjects).set({ html: res.value.files.js, files: res.value.files, updatedAt: new Date() }).where(eq(schema.createProjects.id, id)).run();
  return { reply: res.value.reply, code: res.value.code, files: res.value.files, mock: res.mock };
}
