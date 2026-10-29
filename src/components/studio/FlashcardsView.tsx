"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/p2-client";
import type { DictKey } from "@/lib/i18n/dict";
import type { Flashcards } from "@/lib/studio/types";

export function FlashcardsView({ id, initial }: { id: string; initial: Flashcards }) {
  const { t } = useT();
  const router = useRouter();
  const total = initial.cards.length;
  const [known, setKnown] = useState<number[]>(initial.known ?? []);
  const [unknown, setUnknown] = useState<number[]>(initial.unknown ?? []);
  const seen = known.length + unknown.length;
  const [i, setI] = useState(seen >= total ? total : seen);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DictKey | null>(null);

  function answer(ok: boolean) {
    const k = ok ? [...known, i] : known;
    const u = ok ? unknown : [...unknown, i];
    setKnown(k);
    setUnknown(u);
    setFlipped(false);
    setI(i + 1);
    void api(`/api/studio/${id}`, { progress: { known: k, unknown: u } }, "PATCH");
  }

  function restart() {
    setKnown([]);
    setUnknown([]);
    setI(0);
    setFlipped(false);
    void api(`/api/studio/${id}`, { progress: { known: [], unknown: [] } }, "PATCH");
  }

  async function practiceWeak() {
    setBusy(true);
    const r = await api<{ href: string }>(`/api/studio/${id}/convert`, { to: "quiz", only: unknown });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    router.push(r.data.href);
  }

  if (i >= total) {
    return (
      <div className="card mx-auto max-w-xl space-y-4 p-8 text-center" data-testid="fc-done">
        <p className="text-4xl" aria-hidden>🎉</p>
        <p className="text-lg font-semibold">{t("st.fc.done", { known: known.length, unknown: unknown.length })}</p>
        {unknown.length > 0 && (
          <>
            <p className="text-sm text-slate-600">{t("st.fc.weak", { n: unknown.length })}</p>
            <ul className="mx-auto max-w-sm text-left text-sm">
              {unknown.map((u) => <li key={u}>• {initial.cards[u]?.front}</li>)}
            </ul>
          </>
        )}
        <div className="flex justify-center gap-2">
          {unknown.length > 0 && <button className="btn btn-primary" onClick={practiceWeak} disabled={busy}>{busy ? t("p2.working") : t("st.fc.practiceWeak")}</button>}
          <button className="btn" onClick={restart}>{t("st.fc.restart")}</button>
        </div>
        {error && <p className="text-sm text-rose-700" role="alert">{t(error)}</p>}
      </div>
    );
  }

  const card = initial.cards[i];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{t("st.fc.progress", { n: i + 1, total })}</span>
        <span>✓ {known.length} · ✗ {unknown.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${(i / total) * 100}%` }} />
      </div>
      <button
        className="card flex min-h-60 w-full flex-col items-center justify-center gap-2 p-8 text-center transition hover:shadow"
        onClick={() => setFlipped((f) => !f)}
        aria-label={t("st.fc.flip")}
        data-testid="fc-card"
      >
        <span className="text-xs tracking-wide text-slate-400 uppercase">{flipped ? t("st.fc.back") : t("st.fc.front")}</span>
        <span className={flipped ? "text-base text-slate-700" : "text-2xl font-semibold"}>{flipped ? card.back : card.front}</span>
        {!flipped && <span className="mt-2 text-xs text-slate-400">{t("st.fc.flip")}</span>}
      </button>
      <div className="flex justify-center gap-3">
        <button className="btn min-w-28" onClick={() => answer(false)} data-testid="fc-unknown">✗ {t("st.fc.unknown")}</button>
        <button className="btn btn-primary min-w-28" onClick={() => answer(true)} data-testid="fc-known">✓ {t("st.fc.known")}</button>
      </div>
    </div>
  );
}
