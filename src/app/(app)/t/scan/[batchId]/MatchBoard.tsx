"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, GripVertical, QrCode } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { ScanMatch } from "@/lib/db/schema";
import { assignPageAction } from "../actions";

export type BoardPage = { id: string; url: string; seq: number; studentId: string | null; pageNo: number; match: ScanMatch; filename: string; ocrText: string; ocrDone: boolean };
export type BoardStudent = { id: string; username: string; displayName: string; avatar: string };

const MATCH_STYLE: Record<ScanMatch, string> = {
  qr: "bg-emerald-50 text-emerald-700",
  name: "bg-emerald-50 text-emerald-700",
  order: "bg-sky-50 text-sky-700",
  manual: "bg-indigo-50 text-indigo-700",
  failed: "bg-rose-50 text-rose-700",
};

/** Page thumbnails grouped by student; unmatched pages can be dragged onto the roster or remapped via the menu. */
export function MatchBoard({ batchId, pages, roster, pps, locked }: { batchId: string; pages: BoardPage[]; roster: BoardStudent[]; pps: number; locked: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [zoom, setZoom] = useState<BoardPage | null>(null);
  const byId = new Map(roster.map((r) => [r.id, r]));
  const failed = pages.filter((p) => !p.studentId);
  const count = (sid: string) => pages.filter((p) => p.studentId === sid).length;

  function assign(pageId: string, studentId: string, pageNo?: number) {
    start(async () => {
      await assignPageAction(batchId, pageId, studentId, pageNo ?? count(studentId) + 1);
      router.refresh();
    });
  }

  const thumb = (p: BoardPage) => {
    const s = p.studentId ? byId.get(p.studentId) : undefined;
    return (
      <li key={p.id} className={`card overflow-hidden ${!p.studentId ? "ring-2 ring-rose-300" : ""}`} data-testid={p.studentId ? "scan-page" : "scan-page-failed"}
        draggable={!locked} onDragStart={(e) => { e.dataTransfer.setData("text/x-scan-page", p.id); e.dataTransfer.effectAllowed = "move"; }}>
        <button type="button" className="relative block w-full bg-slate-100" onClick={() => setZoom(p)} aria-label={`${t("sc.zoom")} #${p.seq}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={`#${p.seq}`} className="aspect-[1/1.414] w-full object-cover object-top" loading="lazy" />
          <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] tabular-nums text-slate-600">#{p.seq}</span>
          {!locked && <GripVertical className="absolute right-1 top-1 h-4 w-4 text-slate-500" aria-hidden />}
        </button>
        <div className="space-y-1 p-2 text-xs">
          <div className="flex items-center gap-1">
            <span className={`badge ${MATCH_STYLE[p.match]}`}>{p.match === "qr" && <QrCode className="mr-0.5 inline h-3 w-3" />}{t(`sc.match.${p.match}`)}</span>
            {s ? <span className="truncate">{s.displayName} · {t("sc.pageOf", { n: p.pageNo })}</span> : <span className="text-rose-700">{t("sc.unmatched")}</span>}
          </div>
          {!locked && (
            <div className="flex gap-1">
              <select className="input min-w-0 flex-1 px-1 py-0.5 text-xs" value={p.studentId ?? ""} disabled={pending}
                onChange={(e) => assign(p.id, e.target.value, e.target.value === p.studentId ? p.pageNo : undefined)} aria-label={t("sc.assignTo")} data-testid="scan-assign">
                <option value="">{p.studentId ? t("sc.unassign") : t("sc.assignTo")}</option>
                {roster.map((r) => <option key={r.id} value={r.id}>{r.username} {r.displayName}</option>)}
              </select>
              {p.studentId && (
                <select className="input w-12 px-1 py-0.5 text-xs" value={p.pageNo} disabled={pending} onChange={(e) => assign(p.id, p.studentId!, Number(e.target.value))} aria-label={t("sc.page", { n: p.pageNo })}>
                  {Array.from({ length: Math.max(pps, p.pageNo) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              )}
            </div>
          )}
          {p.ocrDone && p.ocrText && (
            <details>
              <summary className="cursor-pointer text-slate-500">{t("sc.ocrText")}</summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-1 font-sans text-[11px]">{p.ocrText}</pre>
            </details>
          )}
        </div>
      </li>
    );
  };

  const grouped = roster.filter((r) => count(r.id)).map((r) => ({ r, ps: pages.filter((p) => p.studentId === r.id).sort((a, b) => a.pageNo - b.pageNo) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0 space-y-4">
        {failed.length > 0 ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50/50 p-3" data-testid="scan-failed">
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-rose-800"><AlertTriangle className="h-4 w-4" />{t("sc.failedN", { n: failed.length })}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">{failed.map(thumb)}</ul>
          </section>
        ) : pages.length > 0 && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="scan-all-matched">{t("sc.allMatched")}</p>}
        {grouped.map(({ r, ps }) => (
          <section key={r.id}>
            <h3 className="mb-2 text-sm font-semibold"><span aria-hidden>{r.avatar}</span> {r.displayName} <span className="font-normal text-slate-400">{r.username} · {ps.length}/{pps}</span></h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">{ps.map(thumb)}</ul>
          </section>
        ))}
      </div>

      <aside className="card self-start lg:sticky lg:top-4" aria-label={t("sc.roster")}>
        <h3 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold">{t("sc.roster")} <span className="font-normal text-slate-400">{!locked && `· ${t("sc.rosterHint")}`}</span></h3>
        {roster.length === 0 ? <p className="p-3 text-xs text-slate-500">{t("sc.noRoster")}</p> : (
          <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto" data-testid="scan-roster">
            {roster.map((r) => {
              const n = count(r.id);
              return (
                <li key={r.id} data-testid={`roster-${r.username}`}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition ${over === r.id ? "bg-brand-100" : ""}`}
                  onDragOver={(e) => { if (!locked && e.dataTransfer.types.includes("text/x-scan-page")) { e.preventDefault(); setOver(r.id); } }}
                  onDragLeave={() => setOver((o) => (o === r.id ? null : o))}
                  onDrop={(e) => { const id = e.dataTransfer.getData("text/x-scan-page"); setOver(null); if (id) { e.preventDefault(); assign(id, r.id); } }}>
                  <span aria-hidden>{r.avatar}</span>
                  <span className="min-w-0 flex-1 truncate">{r.displayName} <span className="text-xs text-slate-400">{r.username}</span></span>
                  <span className={`text-xs tabular-nums ${n === 0 ? "text-slate-300" : n < pps ? "text-amber-700" : "text-emerald-700"}`}>{n}/{pps}</span>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url} alt={`#${zoom.seq}`} className="max-h-[90vh] max-w-full rounded bg-white shadow-xl" />
        </div>
      )}
    </div>
  );
}
