"use client";
import type { ChatTools } from "@/lib/db/schema";
import { withBase } from "@/lib/base-path";

export type SendBody = {
  conversationId?: string;
  tutorSlug?: string;
  preview?: boolean;
  draftId?: string;
  modelId?: string;
  content?: string;
  attachments?: { name: string; text: string }[];
  tools?: Partial<ChatTools>;
  regenerate?: boolean;
  ctx?: string;
};

export type SendResult =
  | { kind: "ok"; conversationId: string; text: string; mock: boolean }
  | { kind: "blocked"; conversationId: string }
  | { kind: "quota" }
  | { kind: "error"; message: string; conversationId?: string };

/** POST /api/chat and stream the plain-text response, calling onText with the accumulated text. */
export async function sendChat(body: SendBody, onText: (text: string) => void, signal?: AbortSignal): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(withBase("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return { kind: "error", message: "aborted" };
    return { kind: "error", message: (e as Error).message || "network" };
  }
  const ctype = res.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const j = await res.json().catch(() => ({}));
    if (j.blocked) return { kind: "blocked", conversationId: j.conversationId };
    if (j.error === "quota") return { kind: "quota" };
    return { kind: "error", message: j.message ?? j.error ?? `HTTP ${res.status}` };
  }
  const conversationId = res.headers.get("x-conversation-id") ?? "";
  const mock = res.headers.get("x-mock") === "1";
  let text = "";
  const reader = res.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        onText(text);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") return { kind: "error", message: (e as Error).message, conversationId };
    }
  }
  return { kind: "ok", conversationId, text, mock };
}
