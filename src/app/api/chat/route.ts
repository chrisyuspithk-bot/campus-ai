import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ChatTools } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { modelsFor, resolveModel } from "@/lib/models";
import { quotaStatus, recordUsage } from "@/lib/quota";
import { getSetting } from "@/lib/settings";
import { newId } from "@/lib/ids";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { retrieve } from "@/lib/ai/rag";
import { checkSafety, recordSafety, type SafetyResult } from "@/lib/ai/safety";
import { citationsMarkdown, generateImage, hasOpenRouterKey, streamChat, type ChatMessage, type Citation, type StreamEvent } from "@/lib/ai/openrouter";
import { mockImage, mockStream } from "@/lib/ai/mock";
import { imageModelLive } from "@/lib/p7/models";
import { translate } from "@/lib/i18n/dict";
import { activeLockedAttempt } from "@/lib/p3/exam";

type Body = {
  conversationId?: string;
  tutorSlug?: string;
  preview?: boolean;
  draftId?: string;
  modelId?: string;
  content?: string;
  attachments?: { name: string; text: string }[];
  tools?: Partial<ChatTools>;
  regenerate?: boolean;
  /** Side-panel page context, e.g. "Student home" */
  ctx?: string;
};

const HISTORY_LIMIT = 24;
const MAX_INPUT = 12_000;

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function POST(req: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_json");
  }
  const features = featuresFor(user.role);
  // P3 exam lock: no AI (page, side panel or API) while an AI-locked attempt is open.
  if (user.role === "student" && activeLockedAttempt(user.id)) {
    return fail(423, "exam_locked", { message: translate(user.language, "p3.err.examLocked") });
  }

  // ---- Conversation (load or create) -------------------------------------------------
  let conv = body.conversationId
    ? db
        .select()
        .from(schema.conversations)
        .where(and(eq(schema.conversations.id, body.conversationId), eq(schema.conversations.userId, user.id)))
        .get()
    : undefined;
  if (body.conversationId && !conv) return fail(404, "not_found");
  if (conv?.archived) return fail(403, "archived");

  const tutorId = conv?.tutorId ?? null;
  let tutor = tutorId ? db.select().from(schema.tutors).where(eq(schema.tutors.id, tutorId)).get() : undefined;
  if (!conv && body.tutorSlug) {
    tutor = db.select().from(schema.tutors).where(eq(schema.tutors.slug, body.tutorSlug)).get();
    if (!tutor) return fail(404, "tutor_not_found");
  }
  const isPreview = conv?.preview ?? (Boolean(body.preview) && user.role !== "student");
  if (tutor) {
    if (tutor.status !== "published" && !isPreview) return fail(403, "tutor_unpublished");
    if (!features.tutors && user.role === "student") return fail(403, "feature_off");
  }

  const draftId = conv?.draftId ?? body.draftId ?? null;
  const draft = draftId
    ? db
        .select()
        .from(schema.drafts)
        .where(and(eq(schema.drafts.id, draftId), eq(schema.drafts.ownerId, user.id)))
        .get()
    : undefined;
  if (draftId && !draft) return fail(404, "draft_not_found");
  if (!tutor && !draft && !features.ai_chat) return fail(403, "feature_off");

  // ---- Model + quota -----------------------------------------------------------------
  const options = modelsFor(user.role, tutor?.modelWhitelist ?? []);
  const model = resolveModel(options, body.modelId ?? conv?.modelId, user.defaultModelId);
  if (!model) return fail(403, "no_model");

  const quota = quotaStatus(user.id, user.role);
  if (quota.exhausted) {
    db.insert(schema.events).values({ type: "quota_denied", userId: user.id }).run();
    return fail(429, "quota", { quota });
  }

  const requested = { ...(conv?.tools ?? {}), ...(body.tools ?? {}) } as Partial<ChatTools>;
  const tools: ChatTools = {
    rag: Boolean(tutor) && requested.rag !== false,
    search: Boolean(requested.search) && features.web_search,
    image: Boolean(requested.image) && features.image_gen && !quota.imagesExhausted,
    tts: Boolean(requested.tts) && features.tts,
  };

  // ---- Persist user turn ---------------------------------------------------------------
  const content = (body.content ?? "").slice(0, MAX_INPUT).trim();
  if (!body.regenerate && !content) return fail(400, "empty");

  // Safety check up-front so a blocked first message never becomes a visible title.
  const safety: SafetyResult = body.regenerate ? { blocked: false } : checkSafety(content);

  if (!conv) {
    const title = tutor
      ? tutor.name
      : draft
        ? `📝 ${draft.title}`
        : safety.blocked
          ? translate(user.language, "chat.blockedTitle")
          : content.replace(/\s+/g, " ").slice(0, 40) || "New chat";
    const id = newId();
    db.insert(schema.conversations)
      .values({
        id,
        userId: user.id,
        title,
        tutorId: tutor?.id ?? null,
        draftId: draft?.id ?? null,
        modelId: model.id,
        preview: isPreview && Boolean(tutor),
        tools,
      })
      .run();
    conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get()!;
  }
  const conversationId = conv.id;

  let userText = content;
  if (body.regenerate) {
    const last = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(desc(schema.messages.createdAt), desc(sql`${schema.messages}.rowid`))
      .limit(1)
      .get();
    if (last?.role === "assistant") db.delete(schema.messages).where(eq(schema.messages.id, last.id)).run();
    const lastUser = db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.role, "user")))
      .orderBy(desc(schema.messages.createdAt), desc(sql`${schema.messages}.rowid`))
      .limit(1)
      .get();
    if (!lastUser) return fail(400, "nothing_to_regenerate");
    userText = lastUser.content;
  } else {
    const attachments = (body.attachments ?? []).slice(0, 3);
    if (attachments.length) {
      userText +=
        "\n\n" +
        attachments.map((a) => `📎 **${a.name}**\n\n\`\`\`\n${a.text.slice(0, 8000)}\n\`\`\``).join("\n\n");
    }
    db.insert(schema.messages)
      .values({ id: newId(), conversationId, role: "user", content: userText, flag: safety.blocked ? "blocked" : null })
      .run();
    // Blocked and flagged messages both open a risk case for /a/safety; flagged ones still get an answer.
    recordSafety({ userId: user.id, result: safety, source: "chat", text: content, modelId: model.id, refId: conversationId });
    if (safety.blocked) {
      db.insert(schema.messages)
        .values({ id: newId(), conversationId, role: "assistant", content: "", flag: "blocked" })
        .run();
      db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId)).run();
      return Response.json({ blocked: true, conversationId });
    }
  }

  // ---- Build prompt --------------------------------------------------------------------
  const history = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt), asc(sql`${schema.messages}.rowid`))
    .all()
    .filter((m) => !m.flag && (m.role === "user" || m.content))
    .slice(-HISTORY_LIMIT);

  const ragChunks = tutor && tools.rag ? retrieve(tutor.id, userText) : [];
  const system = buildSystemPrompt({
    schoolName: getSetting("schoolName"),
    role: user.role,
    displayName: user.displayName,
    tutor,
    ragChunks,
    draft: draft ?? null,
    pageContext: body.ctx?.slice(0, 300) ?? null,
    webSearch: tools.search,
  });
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  const mock = !hasOpenRouterKey();
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Conversation-Id": conversationId,
    "X-Model-Id": model.id,
    // P7: the provider model actually used, so the model switch is verifiable from the network tab / smoke.
    "X-OpenRouter-Id": mock ? "mock" : model.openrouterId,
    "X-Mock": mock ? "1" : "0",
  };

  const finish = (text: string, tokens: number, images = 0) => {
    if (text.trim()) {
      db.insert(schema.messages)
        .values({ id: newId(), conversationId, role: "assistant", content: text, modelId: model.id, tokens })
        .run();
    }
    db.update(schema.conversations)
      .set({ updatedAt: new Date(), modelId: model.id, tools })
      .where(eq(schema.conversations.id, conversationId))
      .run();
    recordUsage(user.id, tokens, images);
  };

  // ---- Image generation (non-streaming) ------------------------------------------------
  // P7: when no image model is usable on this key (blank setting, or the provider refuses), fall back to a
  // clearly badged demo image instead of an error. The image quota is still counted.
  if (tools.image) {
    const imageModel = getSetting("imageModel").trim();
    const demo = (why: string) => ({ markdown: mockImage(userText, why), imageCount: 1, tokens: 0 });
    let result: { markdown: string; imageCount: number; tokens: number };
    if (mock || !imageModelLive(imageModel)) result = demo(translate(user.language, "p7.img.noModel"));
    else {
      try {
        result = await generateImage({ model: imageModel, prompt: userText, signal: req.signal });
      } catch (e) {
        console.warn("[chat] image model failed:", (e as Error).message);
        result = demo(translate(user.language, "p7.img.refused"));
      }
    }
    finish(result.markdown, result.tokens, result.imageCount);
    return new Response(result.markdown, { headers: { ...headers, "X-Image-Mock": result.tokens === 0 && /data:image\/svg/.test(result.markdown) ? "1" : "0" } });
  }

  // ---- Streaming text ------------------------------------------------------------------
  const upstream: AsyncGenerator<StreamEvent> = mock
    ? mockStream({
        content: userText,
        tutorName: tutor?.name,
        strict: tutor ? tutor.strategy !== "answers" : false,
        draft: Boolean(draft),
        signal: req.signal,
      })
    : streamChat({ model: model.openrouterId, messages, webSearch: tools.search, signal: req.signal });

  // Pull the first event before responding so upstream errors become a proper HTTP error.
  let first: IteratorResult<StreamEvent>;
  let source = upstream;
  let degraded = "";
  try {
    first = await upstream.next();
  } catch (e) {
    if (!tools.search || mock) return fail(502, "upstream", { message: (e as Error).message });
    // P7: web search unavailable → answer without it, and say so.
    console.warn("[chat] web search failed, retrying without:", (e as Error).message);
    degraded = `> ${translate(user.language, "p7.search.degraded")}\n\n`;
    source = streamChat({ model: model.openrouterId, messages, signal: req.signal });
    try {
      first = await source.next();
    } catch (e2) {
      return fail(502, "upstream", { message: (e2 as Error).message });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      let tokens = 0;
      const cites = new Map<string, Citation>();
      const emit = (s: string) => {
        text += s;
        controller.enqueue(encoder.encode(s));
      };
      if (degraded) emit(degraded);
      const handle = (ev: StreamEvent) => {
        if (ev.type === "text") emit(ev.text);
        else if (ev.type === "citations") ev.citations.forEach((c) => cites.set(c.url, c));
        else tokens = ev.promptTokens + ev.completionTokens;
      };
      try {
        if (!first.done) handle(first.value);
        for await (const ev of source) handle(ev);
        if (cites.size) emit(citationsMarkdown([...cites.values()], user.language === "en" ? "en" : "zh"));
      } catch (e) {
        if (!req.signal.aborted) {
          const msg = `\n\n⚠️ ${(e as Error).message}`;
          controller.enqueue(encoder.encode(msg));
        }
      } finally {
        // Estimate when the provider didn't report usage (e.g. aborted mid-stream).
        if (!tokens) tokens = Math.ceil((system.length + userText.length + text.length) / 3);
        finish(text, tokens);
        try {
          controller.close();
        } catch {
          /* client already gone */
        }
      }
    },
  });
  return new Response(stream, { headers });
}
