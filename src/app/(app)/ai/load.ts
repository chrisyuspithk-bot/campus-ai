import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { modelsFor } from "@/lib/models";
import { quotaStatus } from "@/lib/quota";
import { listConversations, getConversation, toUiMessages } from "@/lib/conversations";
import type { ChatWorkspaceProps } from "@/components/chat/ChatWorkspace";

type TutorRow = typeof schema.tutors.$inferSelect;

function tutorInfo(t: TutorRow) {
  return { slug: t.slug, name: t.name, emoji: t.emoji, subject: t.subject, strategy: t.strategy };
}

function base(user: CurrentUser, tutor: TutorRow | undefined) {
  const features = featuresFor(user.role);
  const q = quotaStatus(user.id, user.role);
  return {
    history: listConversations(user.id),
    models: modelsFor(user.role, tutor?.modelWhitelist ?? []).map((m) => ({ id: m.id, displayName: m.displayName, description: m.description })),
    defaultModelId: user.defaultModelId,
    features: { search: features.web_search, image: features.image_gen, tts: features.tts },
    freeChatEnabled: features.ai_chat,
    quota: {
      percent: q.percent,
      usedToday: q.usedToday,
      dailyTokens: q.dailyTokens,
      imagesToday: q.imagesToday,
      imagesPerDay: q.imagesPerDay,
      exhausted: q.exhausted,
    },
  };
}

export type LoadResult = { kind: "ok"; props: ChatWorkspaceProps } | { kind: "notFound" } | { kind: "disabled" };

/** New chat at /ai (optionally ?tutor=slug&preview=1) or /ai/c/new?ctx=… */
export function loadNewChat(user: CurrentUser, opts: { tutorSlug?: string; preview?: boolean; ctx?: string }): LoadResult {
  let tutor: TutorRow | undefined;
  const features = featuresFor(user.role);
  if (opts.tutorSlug) {
    tutor = db.select().from(schema.tutors).where(eq(schema.tutors.slug, opts.tutorSlug)).get();
    const preview = Boolean(opts.preview) && user.role !== "student";
    if (!tutor || (tutor.status !== "published" && !preview)) return { kind: "notFound" };
    if (!features.tutors && user.role === "student") return { kind: "disabled" };
  } else if (!features.ai_chat) {
    return { kind: "disabled" };
  }
  return {
    kind: "ok",
    props: {
      ...base(user, tutor),
      conversation: null,
      messages: [],
      tutor: tutor ? tutorInfo(tutor) : null,
      preview: Boolean(opts.preview) && user.role !== "student" && Boolean(tutor),
      ctx: opts.ctx ?? null,
    },
  };
}

export function loadConversation(user: CurrentUser, id: string): LoadResult {
  const found = getConversation(user.id, id);
  if (!found) return { kind: "notFound" };
  const { conv, messages } = found;
  const tutor = conv.tutorId ? db.select().from(schema.tutors).where(eq(schema.tutors.id, conv.tutorId)).get() : undefined;
  return {
    kind: "ok",
    props: {
      ...base(user, tutor),
      conversation: {
        id: conv.id,
        title: conv.title,
        modelId: conv.modelId,
        tools: conv.tools,
        archived: conv.archived,
        pinned: conv.pinned,
        isDraft: Boolean(conv.draftId),
      },
      messages: toUiMessages(messages),
      tutor: tutor ? tutorInfo(tutor) : null,
      preview: conv.preview,
      ctx: null,
    },
  };
}
