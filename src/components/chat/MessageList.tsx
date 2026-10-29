"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Flag, RotateCcw, ShieldAlert, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { useT } from "@/lib/i18n/client";
import type { ChatMessage } from "./ChatWorkspace";
import { withBase } from "@/lib/base-path";

function speakable(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, " ")
    .replace(/[#*_>`|!\[\]()-]/g, " ");
}

function AssistantTools({ m, isLast, onRegenerate, ttsEnabled, canRegenerate }: { m: ChatMessage; isLast: boolean; onRegenerate: () => void; ttsEnabled: boolean; canRegenerate: boolean }) {
  const { t, lang } = useT();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(m.feedback);
  const [speaking, setSpeaking] = useState(false);
  // Defer speechSynthesis check until after mount to avoid SSR/client HTML mismatch (React #418).
  const [ttsReady, setTtsReady] = useState(false);
  useEffect(() => {
    setTtsReady(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);
  const persisted = !m.id.startsWith("tmp-");

  function vote(v: 1 | -1) {
    const next = feedback === v ? 0 : v;
    setFeedback(next || null);
    fetch(withBase(`/api/messages/${m.id}/feedback`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: next || null }) });
  }
  function speak() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(speakable(m.content));
    u.lang = /[㐀-鿿]/.test(m.content) ? "zh-HK" : lang === "en" ? "en-GB" : "zh-HK";
    u.onend = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  }
  const btn = "rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700";
  return (
    <div className="mt-1 flex items-center gap-0.5">
      <button
        className={btn}
        title={t("chat.copy")}
        onClick={() => {
          navigator.clipboard.writeText(m.content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4 text-teal-600" /> : <Copy className="h-4 w-4" />}
      </button>
      {ttsEnabled && ttsReady && (
        <button className={btn} title={speaking ? t("chat.stopSpeak") : t("chat.speak")} onClick={speak}>
          {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}
      {isLast && canRegenerate && (
        <button className={btn} title={t("chat.regenerate")} onClick={onRegenerate}>
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      {persisted && (
        <>
          <button className={`${btn} ${feedback === 1 ? "text-teal-600" : ""}`} title={t("chat.good")} onClick={() => vote(1)} aria-pressed={feedback === 1}>
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button className={`${btn} ${feedback === -1 ? "text-rose-600" : ""}`} title={t("chat.bad")} onClick={() => vote(-1)} aria-pressed={feedback === -1}>
            <ThumbsDown className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

function BlockedNotice({ id }: { id: string }) {
  const { t } = useT();
  const [reported, setReported] = useState(false);
  return (
    <div className="flex gap-3 rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p>{t("chat.blocked")}</p>
        {reported ? (
          <p className="mt-2 font-medium">{t("chat.reported")}</p>
        ) : (
          <button
            className="btn btn-sm mt-2"
            disabled={id.startsWith("tmp-")}
            onClick={() => {
              fetch(withBase(`/api/messages/${id}/feedback`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "report" }) });
              setReported(true);
            }}
          >
            <Flag className="h-3.5 w-3.5" /> {t("chat.reportTeacher")}
          </button>
        )}
      </div>
    </div>
  );
}

export function MessageList(props: {
  messages: ChatMessage[];
  tutor: { name: string; emoji: string; subject: string } | null;
  ttsEnabled: boolean;
  streaming: boolean;
  canSend: boolean;
  onSuggestion: (s: string) => void;
  onRegenerate: () => void;
}) {
  const { t } = useT();
  const endRef = useRef<HTMLDivElement>(null);
  const last = props.messages[props.messages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [props.messages.length, last?.content]);

  if (props.messages.length === 0) {
    const suggestions = props.tutor
      ? [t("chat.suggest1"), t("chat.suggest2")]
      : [t("chat.suggest1"), t("chat.suggest2"), t("chat.suggest3"), t("chat.suggest4")];
    return (
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
        <div className="mb-3 text-5xl" aria-hidden>{props.tutor?.emoji ?? "✨"}</div>
        <h2 className="text-xl font-semibold">{props.tutor ? props.tutor.name : t("chat.emptyTitle")}</h2>
        {props.tutor && <p className="mt-1 text-slate-500">{t("chat.emptyTutor")}</p>}
        <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <button key={s} disabled={!props.canSend} onClick={() => props.onSuggestion(s)} className="card px-4 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" data-testid="messages">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {props.messages.map((m, i) => {
          const isLast = i === props.messages.length - 1;
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-[15px] whitespace-pre-wrap text-white shadow-sm" data-role="user">
                  {m.content}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex gap-3" data-role="assistant">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-teal-500 text-sm text-white" aria-hidden>
                {props.tutor?.emoji ?? "AI"}
              </div>
              <div className="min-w-0 flex-1">
                {m.blocked ? (
                  <BlockedNotice id={m.id} />
                ) : (
                  <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    {m.content ? <Markdown>{m.content}</Markdown> : <span className="inline-flex gap-1 text-slate-400"><span className="animate-bounce">•</span><span className="animate-bounce [animation-delay:120ms]">•</span><span className="animate-bounce [animation-delay:240ms]">•</span></span>}
                    {m.error && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {t("chat.error", { msg: m.error })}
                        <button className="btn btn-sm" onClick={props.onRegenerate}>{t("chat.retry")}</button>
                      </div>
                    )}
                  </div>
                )}
                {!m.blocked && !m.streaming && m.content && (
                  <AssistantTools m={m} isLast={isLast} onRegenerate={props.onRegenerate} ttsEnabled={props.ttsEnabled} canRegenerate={!props.streaming && props.canSend} />
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
