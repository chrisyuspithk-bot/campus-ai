"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Maximize2, Plus, Send, Sparkles, Square, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { pageLabelFor } from "@/lib/nav";
import { Markdown } from "@/components/Markdown";
import { sendChat } from "@/components/chat/client";
import type { ShellUser } from "./AppShell";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

/** Right-hand in-page assistant. Uses the same chat engine; carries the current page as context. */
export function AIPanel({ user, onClose }: { user: ShellUser; onClose: () => void }) {
  const { t } = useT();
  const pathname = usePathname();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const labelKey = pageLabelFor(user.role, pathname);
  const pageName = labelKey ? t(labelKey) : pathname;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const ctx =
      `${pageName} (${pathname}); user: ${user.displayName} (${user.role})` +
      (pathname === "/s" ? "; today's to-do: none (homework opens in P3)" : "");
    const update = (text: string, error = false) =>
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: text, error }]);
    const res = await sendChat({ conversationId, content, ctx }, (txt) => update(txt), ac.signal);
    if (res.kind === "ok") setConversationId(res.conversationId);
    else if (res.kind === "blocked") {
      setConversationId(res.conversationId);
      update(t("chat.blocked"), true);
    } else if (res.kind === "quota") update(t("chat.quotaExhausted"), true);
    else if (res.message !== "aborted") update(t("chat.error", { msg: res.message }), true);
    setStreaming(false);
  }

  return (
    <aside
      aria-label={t("panel.title")}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col print:hidden border-l border-slate-200 bg-white shadow-xl sm:static sm:z-auto sm:w-96 sm:shadow-none"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("panel.title")}</div>
          <div className="truncate text-xs text-slate-500">{t("panel.context", { page: pageName })}</div>
        </div>
        <button
          className="btn btn-ghost p-1.5"
          title={t("chat.newChat")}
          onClick={() => {
            abortRef.current?.abort();
            setMessages([]);
            setConversationId(undefined);
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
        <Link
          href={conversationId ? `/ai/c/${conversationId}` : `/ai/c/new?ctx=${encodeURIComponent(pageName)}`}
          className="btn btn-ghost p-1.5"
          title={t("panel.expand")}
        >
          <Maximize2 className="h-4 w-4" />
        </Link>
        <button className="btn btn-ghost p-1.5" onClick={onClose} title={t("panel.close")} aria-label={t("panel.close")}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{t("panel.empty")}</p>}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm whitespace-pre-wrap text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className={`mr-4 rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${m.error ? "bg-amber-50 text-amber-900" : "bg-slate-100"}`}>
              {m.content ? <Markdown>{m.content}</Markdown> : <span className="animate-pulse text-slate-400">…</span>}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={t("panel.placeholder")}
          className="input resize-none"
        />
        {streaming ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()} aria-label={t("chat.stop")}>
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!input.trim()} aria-label={t("chat.send")}>
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
    </aside>
  );
}
