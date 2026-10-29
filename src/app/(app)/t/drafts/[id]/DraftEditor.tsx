"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRightToLine, Check, Copy, Download, Eye, Lock, PencilLine, Save, Send, Square, Trash2 } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { sendChat } from "@/components/chat/client";
import type { UiMessage } from "@/lib/conversations";
import { useT } from "@/lib/i18n/client";
import { deleteDraft, saveDraft } from "../actions";
import { withBase } from "@/lib/base-path";
import { DRAFT_TYPES } from "@/lib/p7/draft-types";

type Draft = { id: string; title: string; type: string; subject: string; content: string; status: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

const TYPES = DRAFT_TYPES;

export function DraftEditor(props: { draft: Draft; conversationId?: string; messages: UiMessage[]; quotaExhausted: boolean }) {
  const { t } = useT();
  const [title, setTitle] = useState(props.draft.title);
  const [type, setType] = useState(props.draft.type);
  const [subject, setSubject] = useState(props.draft.subject);
  const [content, setContent] = useState(props.draft.content);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [saving, startSave] = useTransition();
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState<Msg[]>(props.messages.filter((m) => !m.blocked).map((m) => ({ id: m.id, role: m.role, content: m.content })));
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [inserted, setInserted] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  function save() {
    startSave(async () => {
      await saveDraft(props.draft.id, { title, type, subject, content });
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    });
  }

  // Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function ask() {
    const text = input.trim();
    if (!text || streaming) return;
    // Save first so the assistant sees the latest draft content.
    if (dirty) {
      await saveDraft(props.draft.id, { title, type, subject, content });
      setDirty(false);
    }
    setInput("");
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: text }, { id: `a${Date.now()}`, role: "assistant", content: "" }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const setLast = (c: string, error = false) => setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], content: c, error }]);
    const res = await sendChat({ conversationId, draftId: props.draft.id, content: text }, (c) => setLast(c), ac.signal);
    if (res.kind === "ok") setConversationId(res.conversationId);
    else if (res.kind === "blocked") {
      setConversationId(res.conversationId);
      setLast(t("chat.blocked"), true);
    } else if (res.kind === "quota") setLast(t("chat.quotaExhausted"), true);
    else if (res.message !== "aborted") setLast(t("chat.error", { msg: res.message }), true);
    setStreaming(false);
  }

  function insert(m: Msg) {
    const next = content.trim() ? `${content.trimEnd()}\n\n${m.content}\n` : `${m.content}\n`;
    setContent(next);
    setDirty(true);
    setInserted(m.id);
    setTimeout(() => setInserted(null), 1500);
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Left: AI */}
      <section className="flex min-h-[22rem] flex-col border-b border-slate-200 bg-white lg:w-[26rem] lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Link href="/t/drafts" className="btn btn-ghost p-1.5" aria-label={t("drafts.title")}><ArrowLeft className="h-4 w-4" /></Link>
          <h2 className="font-semibold">{t("drafts.aiSide")}</h2>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="draft-ai-messages">
          {messages.length === 0 && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">「{t("drafts.aiPlaceholder")}」</p>}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm whitespace-pre-wrap text-white">{m.content}</div>
            ) : (
              <div key={m.id} className={`rounded-2xl rounded-bl-sm border px-3 py-2 text-sm ${m.error ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50"}`}>
                {m.content ? <Markdown>{m.content}</Markdown> : <span className="animate-pulse text-slate-400">…</span>}
                {m.content && !m.error && !(streaming && m === messages[messages.length - 1]) && (
                  <button className="btn btn-sm mt-2" onClick={() => insert(m)}>
                    {inserted === m.id ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <ArrowRightToLine className="h-3.5 w-3.5" />}
                    {inserted === m.id ? t("drafts.inserted") : t("drafts.insert")}
                  </button>
                )}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
        <form className="flex items-end gap-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
            rows={2}
            disabled={props.quotaExhausted}
            placeholder={props.quotaExhausted ? t("chat.quotaExhausted") : t("drafts.aiPlaceholder")}
            className="input resize-none"
          />
          {streaming ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()} aria-label={t("chat.stop")}><Square className="h-4 w-4" /></button>
          ) : (
            <button className="btn btn-primary" disabled={!input.trim() || props.quotaExhausted} aria-label={t("chat.send")}><Send className="h-4 w-4" /></button>
          )}
        </form>
      </section>

      {/* Right: document */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <input value={title} onChange={(e) => edit(setTitle)(e.target.value)} className="input min-w-48 flex-1 text-base font-semibold" aria-label={t("drafts.titleCol")} />
          <select value={type} onChange={(e) => edit(setType)(e.target.value)} className="input w-auto" aria-label={t("drafts.type")}>
            {TYPES.map((x) => <option key={x} value={x}>{t(`drafts.type.${x}`)}</option>)}
          </select>
          <input value={subject} onChange={(e) => edit(setSubject)(e.target.value)} placeholder={t("drafts.subject")} className="input w-28" aria-label={t("drafts.subject")} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            <button onClick={() => setTab("edit")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${tab === "edit" ? "bg-white shadow-sm" : "text-slate-500"}`}><PencilLine className="h-3.5 w-3.5" /> {t("drafts.editMd")}</button>
            <button onClick={() => setTab("preview")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${tab === "preview" ? "bg-white shadow-sm" : "text-slate-500"}`}><Eye className="h-3.5 w-3.5" /> {t("drafts.preview")}</button>
          </div>
          <div className="flex-1" />
          {dirty && <span className="text-xs text-amber-600">{t("drafts.unsaved")}</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {savedFlash ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {savedFlash ? t("common.saved") : t("common.save")}
          </button>
          <button className="btn" onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t("common.copied") : t("common.copy")}
          </button>
          <a className="btn" href={withBase(`/api/drafts/${props.draft.id}/export`)} onClick={(e) => { if (dirty) { e.preventDefault(); save(); } }}>
            <Download className="h-4 w-4" /> .md
          </a>
          <span className="btn cursor-not-allowed text-slate-400" title={t("common.comingSoon", { phase: "P3" })} aria-disabled>
            <Lock className="h-3.5 w-3.5" /> {t("drafts.sendBank")} <span className="phase-badge">P3</span>
          </span>
          <button className="btn btn-danger" onClick={() => window.confirm(t("drafts.deleteConfirm")) && deleteDraft(props.draft.id, true)} aria-label={t("common.delete")}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {tab === "edit" ? (
            <textarea
              value={content}
              onChange={(e) => edit(setContent)(e.target.value)}
              className="h-full min-h-[24rem] w-full resize-none p-6 font-mono text-sm leading-relaxed outline-none"
              placeholder="# …"
              aria-label={t("drafts.editMd")}
              data-testid="draft-content"
            />
          ) : (
            <div className="mx-auto max-w-3xl p-6"><Markdown>{content || "_…_"}</Markdown></div>
          )}
        </div>
      </section>
    </div>
  );
}
