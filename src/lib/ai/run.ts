import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { modelsFor, resolveModel, type ModelOption } from "@/lib/models";
import { quotaStatus, recordUsage } from "@/lib/quota";
import { getSetting } from "@/lib/settings";
import { checkSafety, recordSafety } from "./safety";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { completeChat, hasOpenRouterKey, type ChatMessage } from "./openrouter";

export type AiError = "exam_locked" | "quota" | "blocked" | "no_model" | "upstream" | "bad_output";
export type AiResult<T> = { ok: true; value: T; tokens: number; mock: boolean; model: ModelOption } | { ok: false; error: AiError; message?: string };

export function schoolPreamble(user: CurrentUser) {
  return [
    `You are Campus AI, the learning assistant of ${getSetting("schoolName")}, a Hong Kong secondary school.`,
    "Use the language of the source material (Traditional Chinese — Hong Kong written style — or English).",
    user.role === "student"
      ? "The user is a student: support understanding and academic honesty."
      : `The user is a ${user.role}: act as a professional teaching assistant.`,
  ].join("\n");
}

/** Common gate for P2 tools: model, quota, safety. Returns a model or an error. */
export function gate(user: CurrentUser, input: string, source: "essay" | "studio" | "create" | "bank" | "grading" | "practice" | "media" | "research" | "drafts", refId?: string | null) {
  if (user.role === "student" && activeLockedAttempt(user.id)) return { ok: false as const, error: "exam_locked" as const };
  const model = resolveModel(modelsFor(user.role), null, user.defaultModelId);
  if (!model) return { ok: false as const, error: "no_model" as const };
  if (quotaStatus(user.id, user.role).exhausted) {
    db.insert(schema.events).values({ type: "quota_denied", userId: user.id }).run();
    return { ok: false as const, error: "quota" as const };
  }
  const safety = checkSafety(input);
  recordSafety({ userId: user.id, result: safety, source, text: input, modelId: model.id, refId });
  if (safety.blocked) return { ok: false as const, error: "blocked" as const };
  return { ok: true as const, model };
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and chatter). */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Run one structured generation. With an OpenRouter key: JSON-mode completion validated by `normalize`.
 * Without: `mock()` builds the same shape locally (demo mode). Usage is always recorded against the app quota.
 */
export async function runStructured<T>(opts: {
  user: CurrentUser;
  source: "essay" | "studio" | "create" | "bank" | "grading" | "practice" | "media" | "research" | "drafts";
  input: string;
  system: string;
  prompt: string;
  normalize: (raw: unknown) => T | null;
  mock: () => T;
  refId?: string | null;
  signal?: AbortSignal;
}): Promise<AiResult<T>> {
  const g = gate(opts.user, opts.input, opts.source, opts.refId);
  if (!g.ok) return g;
  const model = g.model;

  if (!hasOpenRouterKey()) {
    await new Promise((r) => setTimeout(r, 600)); // feel like a real call in demo mode
    const value = opts.mock();
    const tokens = Math.ceil((opts.system.length + opts.prompt.length + JSON.stringify(value).length) / 3);
    recordUsage(opts.user.id, tokens);
    return { ok: true, value, tokens, mock: true, model };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${schoolPreamble(opts.user)}\n\n${opts.system}\nRespond with a single JSON object only.` },
    { role: "user", content: opts.prompt },
  ];
  try {
    const { text, tokens } = await completeChat({ model: model.openrouterId, messages, json: true, signal: opts.signal });
    recordUsage(opts.user.id, tokens);
    const value = opts.normalize(parseJsonObject(text));
    if (!value) return { ok: false, error: "bad_output" };
    return { ok: true, value, tokens, mock: false, model };
  } catch (e) {
    return { ok: false, error: "upstream", message: (e as Error).message };
  }
}
