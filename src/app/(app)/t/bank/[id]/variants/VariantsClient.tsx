"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { Markdown } from "@/components/Markdown";
import { generateVariants, saveVariants, type VariantDraft } from "../../actions";

const LETTERS = "ABCDEF";

export function VariantsClient({ questionId }: { questionId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [items, setItems] = useState<(VariantDraft & { pick: boolean })[]>([]);
  const [error, setError] = useState<DictKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const picked = items.filter((v) => v.pick);

  const generate = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await generateVariants(questionId, 3);
      if (r.ok) setItems(r.variants.map((v) => ({ ...v, pick: true })));
      else setError(r.error);
    });

  const save = () =>
    start(async () => {
      const r = await saveVariants(questionId, picked.map(({ pick: _pick, ...v }) => v));
      setNotice(t("bk.variant.saved", { n: r.saved }));
      setItems([]);
      router.refresh();
    });

  return (
    <section data-testid="variants">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={generate} disabled={pending} data-testid="variants-generate">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {t("bk.variant.generate", { n: 3 })}
        </button>
        {items.length > 0 && (
          <button className="btn" onClick={save} disabled={pending || picked.length === 0} data-testid="variants-save">{t("bk.variant.save", { n: picked.length })}</button>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-rose-600" role="alert">{t(error)}</p>}
      {notice && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p>}
      <ul className="space-y-3">
        {items.map((v, i) => (
          <li key={i} className={`card p-4 ${v.pick ? "ring-2 ring-brand-200" : "opacity-70"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={v.pick} onChange={(e) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, pick: e.target.checked } : x)))} /> #{i + 1}
              </label>
              <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                {t("bk.difficulty")}
                <select className="input py-0.5 text-xs" value={v.difficulty} onChange={(e) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, difficulty: Number(e.target.value) } : x)))}>
                  {[1, 2, 3].map((d) => <option key={d} value={d}>{"★".repeat(d)}{"☆".repeat(3 - d)}</option>)}
                </select>
              </label>
            </div>
            <Markdown>{v.stem}</Markdown>
            {v.options.length > 0 && <ol className="mt-2 space-y-1 text-sm">{v.options.map((o, k) => <li key={k} className={`flex gap-2 ${String(k) === v.answer ? "font-medium text-emerald-700" : ""}`}><b>{LETTERS[k]}.</b><Markdown>{o}</Markdown></li>)}</ol>}
            {v.type !== "mc" && <p className="mt-2 text-xs text-slate-500">{t("bk.answer")}: {v.answer.split("|").join(" / ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
