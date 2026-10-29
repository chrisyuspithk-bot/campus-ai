"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Lock, MoreHorizontal, X } from "lucide-react";
import type { ChatTools } from "@/lib/db/schema";
import type { ConversationSummary, UiMessage } from "@/lib/conversations";
import { useT } from "@/lib/i18n/client";
import { sendChat, type SendBody } from "./client";
import { HistoryList } from "./HistoryList";
import { MessageList } from "./MessageList";
import { Composer, type Attachment } from "./Composer";
import { SettingsPanel } from "./SettingsPanel";
import { withBase } from "@/lib/base-path";

export type ChatWorkspaceProps = {
  history: ConversationSummary[];
  models: { id: string; displayName: string; description: string }[];
  defaultModelId: string | null;
  features: { search: boolean; image: boolean; tts: boolean };
  freeChatEnabled: boolean;
  quota: {
    percent: number;
    usedToday: number;
    dailyTokens: number;
    imagesToday: number;
    imagesPerDay: number;
    exhausted: boolean;
  };
  conversation: {
    id: string;
    title: string;
    modelId: string | null;
    tools: ChatTools;
    archived: boolean;
    pinned: boolean;
    isDraft: boolean;
  } | null;
  messages: UiMessage[];
  tutor: { slug: string; name: string; emoji: string; subject: string; strategy: string } | null;
  preview: boolean;
  /** Page context carried over from the side panel ("放大成全頁對話") */
  ctx: string | null;
};

export type ChatMessage = UiMessage & { streaming?: boolean; error?: string };

const DEFAULT_TOOLS: ChatTools = { rag: false, search: false, image: false, tts: false };

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const { t } = useT();
  const router = useRouter();
  const [conversationId, setConversationId] = useState(props.conversation?.id);
  const [title, setTitle] = useState(props.conversation?.title ?? (props.tutor ? props.tutor.name : t("chat.newChat")));
  const [messages, setMessages] = useState<ChatMessage[]>(props.messages);
  const [history, setHistory] = useState(props.history);
  const [modelId, setModelId] = useState(() => {
    const wanted = props.conversation?.modelId ?? props.defaultModelId;
    return props.models.find((m) => m.id === wanted)?.id ?? props.models[0]?.id ?? "";
  });
  const [tools, setTools] = useState<ChatTools>(
    props.conversation?.tools ?? { ...DEFAULT_TOOLS, rag: Boolean(props.tutor) },
  );
  const [quotaExhausted, setQuotaExhausted] = useState(props.quota.exhausted);
  const [streaming, setStreaming] = useState(false);
  const [mock, setMock] = useState(false);
  const [drawer, setDrawer] = useState<"history" | "settings" | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const archived = props.conversation?.archived ?? false;

  const refreshHistory = useCallback(async (q = "") => {
    const res = await fetch(withBase(`/api/conversations?q=${encodeURIComponent(q)}`));
    if (res.ok) setHistory((await res.json()).conversations);
  }, []);

  // Abort any in-flight stream when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const persist = useCallback(
    (patch: { modelId?: string; tools?: ChatTools }) => {
      if (!conversationId) return;
      fetch(withBase(`/api/conversations/${conversationId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [conversationId],
  );

  async function run(body: SendBody, optimistic: ChatMessage[]) {
    setStreaming(true);
    const placeholder: ChatMessage = { id: `tmp-a-${Date.now()}`, role: "assistant", content: "", feedback: null, blocked: false, streaming: true };
    setMessages([...optimistic, placeholder]);
    const ac = new AbortController();
    abortRef.current = ac;
    const setLast = (patch: Partial<ChatMessage>) =>
      setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], ...patch }]);

    const res = await sendChat(
      { ...body, conversationId, modelId, tools, ...(props.tutor && !conversationId ? { tutorSlug: props.tutor.slug, preview: props.preview } : {}), ...(props.ctx && !conversationId ? { ctx: props.ctx } : {}) },
      (text) => setLast({ content: text }),
      ac.signal,
    );

    let newId: string | undefined;
    if (res.kind === "ok") {
      newId = res.conversationId;
      setMock(res.mock);
      setLast({ streaming: false });
    } else if (res.kind === "blocked") {
      newId = res.conversationId;
      if (!props.tutor && !conversationId) setTitle(t("chat.blockedTitle"));
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], blocked: true, streaming: false };
        const u = copy.findLastIndex((x) => x.role === "user");
        if (u >= 0) copy[u] = { ...copy[u], blocked: true };
        return copy;
      });
    } else if (res.kind === "quota") {
      setQuotaExhausted(true);
      setMessages((m) => m.slice(0, -1));
    } else if (res.message === "aborted") {
      setLast({ streaming: false });
    } else {
      newId = res.conversationId;
      setLast({ streaming: false, error: res.message });
    }
    setStreaming(false);
    abortRef.current = null;

    if (newId && newId !== conversationId) {
      setConversationId(newId);
      if (!props.tutor && !conversationId && res.kind !== "blocked") setTitle(body.content?.replace(/\s+/g, " ").slice(0, 40) || title);
      // Update the URL without remounting (Next.js integrates with the History API).
      window.history.replaceState(null, "", withBase(`/ai/c/${newId}`));
    }
    // Replace temporary ids with persisted ones so feedback/regenerate work.
    if (newId || conversationId) {
      const r = await fetch(withBase(`/api/conversations/${newId ?? conversationId}/messages`)).catch(() => null);
      if (r?.ok) {
        const { messages: fresh } = (await r.json()) as { messages: UiMessage[] };
        setMessages((cur) => {
          const last = cur[cur.length - 1];
          const merged: ChatMessage[] = fresh.map((m) => ({ ...m }));
          // Keep a client-side error, or a partial answer the server hasn't saved yet (stop pressed).
          if (last?.error || (last?.role === "assistant" && last.content && merged[merged.length - 1]?.role === "user")) {
            merged.push({ ...last, streaming: false });
          }
          return merged;
        });
      }
    }
    refreshHistory();
    router.refresh(); // update quota in chrome
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const read = await Promise.all(
      Array.from(files)
        .slice(0, 3)
        .map(async (f) => ({ name: f.name, text: (await f.text()).slice(0, 8000) })),
    );
    setAttachments((a) => [...a, ...read].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  }

  function send(content: string) {
    const userMsg: ChatMessage = {
      id: `tmp-u-${Date.now()}`,
      role: "user",
      content: content + attachments.map((a) => `\n\n📎 **${a.name}**`).join(""),
      feedback: null,
      blocked: false,
    };
    const base = messages.filter((m) => !m.error);
    setAttachments([]);
    run({ content, attachments }, [...base, userMsg]);
  }

  function regenerate() {
    const base = [...messages];
    if (base[base.length - 1]?.role === "assistant") base.pop();
    run({ regenerate: true }, base);
  }

  function newChat() {
    if (props.tutor && messages.length > 0 && !window.confirm(t("chat.leaveTutor"))) return;
    router.push(`/ai?n=${Date.now()}`);
  }

  const headerTitle = props.tutor ? `${props.tutor.emoji} ${props.tutor.name}` : title;
  const modelLocked = Boolean(props.tutor) && props.models.length <= 1;
  const inputDisabledReason = archived ? t("chat.archivedNotice") : quotaExhausted ? t("chat.quotaExhausted") : null;

  const historyEl = (
    <HistoryList
      items={history}
      activeId={conversationId}
      onNew={newChat}
      onSearch={refreshHistory}
      guardLeave={() => !props.tutor || messages.length === 0 || window.confirm(t("chat.leaveTutor"))}
      onChanged={() => refreshHistory()}
    />
  );
  const settingsEl = (
    <SettingsPanel
      tutor={props.tutor}
      models={props.models}
      modelId={modelId}
      modelLocked={modelLocked}
      onModel={(id) => {
        setModelId(id);
        persist({ modelId: id });
      }}
      tools={tools}
      features={props.features}
      onTools={(next) => {
        setTools(next);
        persist({ tools: next });
      }}
      onUpload={() => fileRef.current?.click()}
      quota={{ ...props.quota, exhausted: quotaExhausted }}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.tex,text/*"
        onChange={(e) => onFiles(e.target.files)}
      />
      {/* Left: history */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white xl:flex xl:flex-col">{historyEl}</aside>

      {/* Center: messages */}
      <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <button className="btn btn-ghost p-1.5 xl:hidden" onClick={() => setDrawer("history")} aria-label={t("chat.history")}>
            <History className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold" data-testid="chat-title">{headerTitle}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {props.tutor ? (
                <span className="badge bg-brand-50 text-brand-700"><Lock className="h-3 w-3" /> {t("chat.tutorMode")} · {props.tutor.subject}</span>
              ) : (
                <span className="badge">{t("chat.freeChat")}</span>
              )}
              {props.preview && <span className="badge bg-amber-50 text-amber-800">{t("chat.previewMode")}</span>}
              {archived && <span className="badge bg-slate-200">{t("chat.archived")}</span>}
              {mock && <span className="badge bg-teal-50 text-teal-700" title="OPENROUTER_API_KEY not set">{t("chat.mockNotice")}</span>}
            </div>
          </div>
          <button className="btn btn-ghost p-1.5 lg:hidden" onClick={() => setDrawer("settings")} aria-label={t("chat.openSettings")}>
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </header>

        <MessageList
          messages={messages}
          tutor={props.tutor}
          ttsEnabled={tools.tts && props.features.tts}
          streaming={streaming}
          onSuggestion={(s) => send(s)}
          onRegenerate={regenerate}
          canSend={!inputDisabledReason}
        />

        <Composer
          draftKey={conversationId ?? `new:${props.tutor?.slug ?? "free"}`}
          streaming={streaming}
          disabledReason={inputDisabledReason}
          attachments={attachments}
          onRemoveAttachment={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
          onAttach={() => fileRef.current?.click()}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
        />
      </section>

      {/* Right: settings */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white lg:block">{settingsEl}</aside>

      {drawer && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(null)} />
          <div className={`absolute inset-y-0 flex w-80 max-w-[85%] flex-col bg-white shadow-xl ${drawer === "history" ? "left-0" : "right-0"}`}>
            <button className="btn btn-ghost absolute top-2 right-2 z-10 p-1.5" onClick={() => setDrawer(null)} aria-label={t("common.close")}>
              <X className="h-4 w-4" />
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto" onClick={(e) => (e.target as HTMLElement).closest("a") && setDrawer(null)}>
              {drawer === "history" ? historyEl : settingsEl}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
