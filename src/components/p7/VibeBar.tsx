"use client";
import { useState, useTransition } from "react";
import { Loader2, Wand2, Wrench } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import type { ProjectFiles } from "@/lib/p8/files";

export type VibeResult = { error?: string; reply?: string; code?: string; files?: ProjectFiles; mock?: boolean };

/**
 * P7 natural-language → code bar (code sandbox + app builder). The parent decides what to do with the result.
 * P8: `fix` (set after a sandbox error / timeout) adds the 「用 AI 修」 button, which sends the error with the files.
 */
export function VibeBar({ run, onCode, onResult, fix, placeholder }: {
  run: (instruction: string) => Promise<VibeResult>;
  onCode?: (code: string) => void;
  onResult?: (r: VibeResult) => void;
  fix?: (() => Promise<VibeResult>) | null;
  placeholder: string;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; mock?: boolean } | null>(null);
  const [pending, start] = useTransition();

  function handle(p: Promise<VibeResult>, clear: boolean, done: DictKey) {
    setMsg(null);
    start(async () => {
      const r = await p;
      if (r.error) return setMsg({ ok: false, text: t((r.error.startsWith("p2.") ? r.error : r.error === "too_big" ? "p6.ap.tooBig" : "p6.err.generic") as DictKey) });
      if (r.code) onCode?.(r.code);
      onResult?.(r);
      if (clear) setText("");
      setMsg({ ok: true, text: r.reply || t(done), mock: r.mock });
    });
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v || pending) return;
    handle(run(v), true, "p7.vibe.done");
  }

  return (
    <div className="space-y-1" data-testid="vibe-bar">
      <form onSubmit={go} className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1 py-1.5 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={t("p7.vibe.label")} maxLength={1000} data-testid="vibe-input" />
        <button className="btn btn-sm btn-primary shrink-0" disabled={pending || !text.trim()} data-testid="vibe-go">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {t("p7.vibe.go")}
        </button>
        {fix && (
          <button type="button" className="btn btn-sm shrink-0 border-rose-300 bg-rose-50 text-rose-800" disabled={pending} onClick={() => handle(fix(), false, "p8.fix.done")} data-testid="vibe-fix">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} {t("p8.fix.go")}
          </button>
        )}
      </form>
      {fix && !msg && <p className="px-1 text-xs text-rose-700">{t("p8.fix.hint")}</p>}
      {msg && (
        <p className={`rounded px-2 py-1 text-xs ${msg.ok ? "bg-violet-50 text-violet-800" : "bg-rose-50 text-rose-700"}`} role="status" data-testid="vibe-msg">
          {msg.mock && <span className="badge mr-1 bg-amber-50 text-amber-800">{t("p7.demo")}</span>}
          {msg.text}
        </p>
      )}
    </div>
  );
}
