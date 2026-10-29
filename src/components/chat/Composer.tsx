"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Paperclip, Send, Square, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export type Attachment = { name: string; text: string };

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function getRecognizer(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Composer(props: {
  draftKey: string;
  streaming: boolean;
  disabledReason: string | null;
  attachments: Attachment[];
  onRemoveAttachment: (i: number) => void;
  onAttach: () => void;
  onSend: (content: string) => void;
  onStop: () => void;
}) {
  const { t, lang } = useT();
  const storageKey = `campus.draft.${props.draftKey}`;
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Restore an unsent local draft (survives errors / reloads).
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    /* eslint-disable react-hooks/set-state-in-effect -- browser-only APIs */
    if (saved) setValue(saved);
    setCanVoice(Boolean(getRecognizer()));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey]);

  useEffect(() => {
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
    }
  }, [value, storageKey]);

  const disabled = Boolean(props.disabledReason);

  function submit() {
    const content = value.trim();
    if (!content || props.streaming || disabled) return;
    props.onSend(content);
    setValue("");
  }

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Rec = getRecognizer();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = lang === "en" ? "en-GB" : "zh-HK";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join("");
      setValue((v) => (v ? `${v} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {props.disabledReason && (
          <p role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="input-disabled">
            {props.disabledReason}
          </p>
        )}
        {props.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {props.attachments.map((a, i) => (
              <span key={i} className="badge bg-brand-50 text-brand-800">
                📎 {a.name}
                <button onClick={() => props.onRemoveAttachment(i)} aria-label={t("common.delete")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={disabled}
            placeholder={t("chat.inputPlaceholder")}
            aria-label={t("chat.inputPlaceholder")}
            className="max-h-56 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none disabled:cursor-not-allowed"
          />
          <button type="button" className="btn btn-ghost p-2" onClick={props.onAttach} disabled={disabled} title={t("chat.attach")} aria-label={t("chat.attach")}>
            <Paperclip className="h-5 w-5" />
          </button>
          {canVoice && (
            <button type="button" className={`btn btn-ghost p-2 ${listening ? "text-rose-600" : ""}`} onClick={toggleVoice} disabled={disabled} title={t("chat.voice")} aria-label={t("chat.voice")}>
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
          {props.streaming ? (
            <button type="button" className="btn" onClick={props.onStop}>
              <Square className="h-4 w-4" /> {t("chat.stop")}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={disabled || !value.trim()}>
              <Send className="h-4 w-4" /> <span className="hidden sm:inline">{t("chat.send")}</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
