"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { PaperSection, QuestionType } from "@/lib/db/schema";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deletePaper, savePaper } from "../../actions";

type BankQ = { id: string; code: string; subject: string; topic: string; type: QuestionType; difficulty: number; marks: number; stem: string };
type Drag = { qid: string; from: number | null };

const plain = (s: string) => s.replace(/\$/g, "").replace(/\n+/g, " ");

export function PaperEditor({ paper, bank }: { paper: { id: string; title: string; subject: string; durationMin: number; shuffle: boolean; lockAi: boolean; sections: PaperSection[] }; bank: BankQ[] }) {
  const { t } = useT();
  const [title, setTitle] = useState(paper.title);
  const [duration, setDuration] = useState(paper.durationMin);
  const [shuffle, setShuffle] = useState(paper.shuffle);
  const [lockAi, setLockAi] = useState(paper.lockAi);
  const [sections, setSections] = useState<PaperSection[]>(paper.sections.length ? paper.sections : [{ title: "一、", questionIds: [] }]);
  const [active, setActive] = useState(sections.length - 1);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [filter, setFilter] = useState({ subject: paper.subject, q: "", type: "" });
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const inPaper = new Set(sections.flatMap((s) => s.questionIds));
  const total = [...inPaper].reduce((s, id) => s + (byId.get(id)?.marks ?? 0), 0);
  const subjects = [...new Set(bank.map((q) => q.subject))];
  const visible = bank.filter(
    (q) => (!filter.subject || q.subject === filter.subject) && (!filter.type || q.type === filter.type) && (!filter.q || `${q.code} ${q.topic} ${q.stem}`.toLowerCase().includes(filter.q.toLowerCase())),
  );

  function update(fn: (s: PaperSection[]) => PaperSection[]) {
    setSections((s) => fn(s.map((x) => ({ ...x, questionIds: [...x.questionIds] }))));
    setDirty(true);
    setSaved(false);
  }

  /** Move (or add from the bank) a question into section `to` before index `at` (end if undefined). */
  function place(qid: string, to: number, at?: number) {
    update((s) => {
      for (const sec of s) {
        const i = sec.questionIds.indexOf(qid);
        if (i >= 0) {
          sec.questionIds.splice(i, 1);
          if (sec === s[to] && at !== undefined && i < at) at--;
        }
      }
      const list = s[to].questionIds;
      list.splice(at === undefined ? list.length : Math.max(0, Math.min(at, list.length)), 0, qid);
      return s;
    });
  }

  function move(si: number, i: number, dir: -1 | 1) {
    update((s) => {
      const list = s[si].questionIds;
      const j = i + dir;
      if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
      else if (j < 0 && si > 0) s[si - 1].questionIds.push(list.splice(i, 1)[0]);
      else if (j >= list.length && si < s.length - 1) s[si + 1].questionIds.unshift(list.splice(i, 1)[0]);
      return s;
    });
  }

  const save = () =>
    start(async () => {
      const r = await savePaper(paper.id, { title, durationMin: duration, shuffle, lockAi, sections });
      if (r.ok) {
        setDirty(false);
        setSaved(true);
      }
    });

  let n = 0;
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/t/papers" className="text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
        <input className="input max-w-md flex-1 text-lg font-semibold" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} aria-label={t("p2.title")} />
        <span className={`text-sm ${dirty ? "text-amber-600" : "text-slate-400"}`}>{dirty ? t("pp.unsaved") : saved ? t("pp.saved") : ""}</span>
        <button className="btn btn-primary" onClick={save} disabled={pending} data-testid="paper-save">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t("pp.save")}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_16rem]">
        {/* Bank browser */}
        <section className="card flex max-h-[75vh] min-w-0 flex-col" aria-label={t("pp.bank")}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <h2 className="section-title">{t("pp.bank")}</h2>
            <div className="flex gap-2">
              <select className="input py-1 text-sm" value={filter.subject} onChange={(e) => setFilter({ ...filter, subject: e.target.value })} aria-label={t("bk.subject")}>
                <option value="">{t("common.all")}</option>
                {subjects.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select className="input py-1 text-sm" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} aria-label={t("bk.type")}>
                <option value="">{t("common.all")}</option>
                {(["mc", "short", "long", "upload"] as const).map((x) => <option key={x} value={x}>{t(`bk.type.${x}`)}</option>)}
              </select>
            </div>
            <input className="input py-1 text-sm" placeholder={t("common.search")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto" data-testid="editor-bank">
            {visible.map((q) => (
              <li key={q.id} draggable={!inPaper.has(q.id)} onDragStart={() => setDrag({ qid: q.id, from: null })} onDragEnd={() => setDrag(null)} className="flex items-start gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs"><span className="font-mono font-semibold">{q.code}</span><span className="badge">{t(`bk.type.${q.type}`)}</span><span className="text-slate-400">{q.topic} · {q.marks}</span></div>
                  <p className="line-clamp-2 text-slate-600">{plain(q.stem)}</p>
                </div>
                {inPaper.has(q.id) ? (
                  <span className="shrink-0 text-xs text-emerald-600">{t("pp.inPaper")}</span>
                ) : (
                  <button className="btn btn-sm shrink-0" onClick={() => place(q.id, Math.min(active, sections.length - 1))} aria-label={`${t("common.add")} ${q.code}`}><Plus className="h-3.5 w-3.5" /></button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Structure */}
        <section className="min-w-0 space-y-3" aria-label={t("pp.structure")} data-testid="editor-structure">
          <h2 className="section-title">{t("pp.structure")}</h2>
          {sections.map((s, si) => (
            <div
              key={si}
              className={`card p-3 ${active === si ? "ring-2 ring-brand-200" : ""}`}
              onClick={() => setActive(si)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) place(drag.qid, si);
                setDrag(null);
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <input className="input py-1 font-medium" value={s.title} placeholder={t("pp.sectionPh")} onChange={(e) => update((x) => { x[si].title = e.target.value; return x; })} aria-label={t("pp.sectionPh")} />
                {sections.length > 1 && (
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); update((x) => { const [gone] = x.splice(si, 1); x[Math.max(0, si - 1)].questionIds.push(...gone.questionIds); return x; }); setActive(0); }} aria-label={t("pp.remove")}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {s.questionIds.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">{t("pp.dropHere")}</p>
              ) : (
                <ol className="space-y-1">
                  {s.questionIds.map((qid, i) => {
                    const q = byId.get(qid);
                    n++;
                    return (
                      <li
                        key={qid}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDrag({ qid, from: si }); }}
                        onDragEnd={() => setDrag(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag) place(drag.qid, si, i); setDrag(null); }}
                        className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-sm ${drag?.qid === qid ? "opacity-40" : "border-slate-200"}`}
                        data-qid={qid}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" aria-hidden />
                        <span className="w-6 text-right font-medium text-slate-500">{n}.</span>
                        <span className="font-mono text-xs">{q?.code ?? "?"}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-600">{q ? plain(q.stem) : qid}</span>
                        <span className="text-xs text-slate-400">{q?.marks}</span>
                        <button className="btn btn-ghost btn-sm p-1" onClick={() => move(si, i, -1)} aria-label={t("pp.up")}><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button className="btn btn-ghost btn-sm p-1" onClick={() => move(si, i, 1)} aria-label={t("pp.down")}><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button className="btn btn-ghost btn-sm p-1 text-rose-600" onClick={() => update((x) => { x[si].questionIds.splice(i, 1); return x; })} aria-label={t("pp.remove")}><Trash2 className="h-3.5 w-3.5" /></button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ))}
          <button className="btn" onClick={() => { update((x) => [...x, { title: "", questionIds: [] }]); setActive(sections.length); }}>{t("pp.addSection")}</button>
        </section>

        {/* Settings */}
        <aside className="card h-fit space-y-3 p-4 text-sm" aria-label={t("pp.settings")}>
          <h2 className="section-title">{t("pp.settings")}</h2>
          <div>
            <label className="label" htmlFor="pp-dur">{t("pp.duration")}</label>
            <input id="pp-dur" type="number" min={1} max={600} className="input" value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setDirty(true); }} />
          </div>
          <div className="flex justify-between"><span className="text-slate-500">{t("pp.total")}</span><span className="font-semibold" data-testid="paper-total">{total}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t("sa.detail.questions")}</span><span className="font-semibold">{inPaper.size}</span></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={shuffle} onChange={(e) => { setShuffle(e.target.checked); setDirty(true); }} /> {t("pp.shuffle")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={lockAi} onChange={(e) => { setLockAi(e.target.checked); setDirty(true); }} /> {t("pp.lockAi")}</label>
          <hr className="border-slate-100" />
          <Link href={`/t/papers/${paper.id}`} className="btn w-full">{t("pp.preview")}</Link>
          <Link href={`/t/papers/${paper.id}?answers=1`} className="btn w-full">{t("pp.printKey")}</Link>
          <Link href={`/t/assignments/new?paper=${paper.id}`} className={`btn btn-primary w-full ${dirty ? "pointer-events-none opacity-50" : ""}`} aria-disabled={dirty}>{t("pp.assign")}</Link>
          <form action={deletePaper}>
            <input type="hidden" name="id" value={paper.id} />
            <ConfirmSubmit message={t("pp.confirmDelete")} className="btn btn-danger w-full">{t("pp.delete")}</ConfirmSubmit>
          </form>
        </aside>
      </div>
    </div>
  );
}
