import "server-only";
import { and, desc, eq, like } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { newId } from "@/lib/ids";
import { getSetting } from "@/lib/settings";
import { recordUsage } from "@/lib/quota";
import { gate } from "@/lib/ai/run";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { citationsMarkdown, completeChat, hasOpenRouterKey, type ChatMessage } from "@/lib/ai/openrouter";

// P7 (G7) research entry: one question → web-plugin answer with a sources list, saved as a normal chat
// conversation (tools.search on) so it can be continued in /ai. If the web plugin fails the answer is given
// without it and says so; without a key it is a labelled demo.

export const RESEARCH_PREFIX = "🔎 ";

export function listResearch(userId: string) {
  const c = schema.conversations;
  return db.select().from(c).where(and(eq(c.userId, userId), like(c.title, `${RESEARCH_PREFIX}%`))).orderBy(desc(c.updatedAt)).limit(10).all();
}

export type ResearchResult = { ok: true; conversationId: string } | { ok: false; error: string };

export async function runResearch(user: CurrentUser, query: string): Promise<ResearchResult> {
  const q = query.trim().slice(0, 500);
  if (!q) return { ok: false, error: "empty" };
  const g = gate(user, q, "research");
  if (!g.ok) return g;
  const model = g.model;
  const lang = user.language === "en" ? "en" : "zh";
  const system = [
    buildSystemPrompt({ schoolName: getSetting("schoolName"), role: user.role, displayName: user.displayName, webSearch: true }),
    "This is a RESEARCH request: give a concise, well-structured summary (headings / bullets), distinguish facts from opinions, note dates, and cite the sources you used inline as [1], [2]… matching the web results. Finish with 2 suggested follow-up questions.",
  ].join("\n\n");
  const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content: q }];

  let text = "";
  let tokens = 0;
  if (!hasOpenRouterKey()) {
    text = lang === "zh" ? `（**示範模式**：未設定 API key，未有真正上網搜尋。）\n\n關於「${q}」：請設定 OpenRouter key 後再試，屆時會附上來源連結。` : `(**Demo mode**: no API key, no live web search.)\n\nAbout "${q}": set an OpenRouter key to get a cited answer.`;
    tokens = 200;
  } else {
    try {
      const r = await completeChat({ model: model.openrouterId, messages, webSearch: true });
      text = r.text.trim() + citationsMarkdown(r.citations, lang);
      tokens = r.tokens;
    } catch (e) {
      console.warn("[research] web plugin failed:", (e as Error).message);
      try {
        const r = await completeChat({ model: model.openrouterId, messages });
        text = `> ${lang === "zh" ? "網上搜尋暫時用唔到，以下為模型一般知識回答（未經網上查證）。" : "Web search is unavailable right now; this answer is from general model knowledge (not web-verified)."}\n\n${r.text.trim()}`;
        tokens = r.tokens;
      } catch (e2) {
        console.warn("[research] fallback failed:", (e2 as Error).message);
        return { ok: false, error: "upstream" };
      }
    }
  }
  recordUsage(user.id, tokens);
  const conversationId = newId();
  db.insert(schema.conversations)
    .values({ id: conversationId, userId: user.id, title: `${RESEARCH_PREFIX}${q.replace(/\s+/g, " ").slice(0, 36)}`, modelId: model.id, tools: { rag: false, search: true, image: false, tts: false } })
    .run();
  db.insert(schema.messages).values({ id: newId(), conversationId, role: "user", content: q }).run();
  db.insert(schema.messages).values({ id: newId(), conversationId, role: "assistant", content: text, modelId: model.id, tokens }).run();
  return { ok: true, conversationId };
}
