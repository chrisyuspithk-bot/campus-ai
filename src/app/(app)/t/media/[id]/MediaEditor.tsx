"use client";
import { useState, useTransition } from "react";
import { Clapperboard, FileText, Film, Plus, Sparkles, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import type { VideoScene, VideoStatus } from "@/lib/db/schema";
import { ScenePlayer } from "@/components/p6/ScenePlayer";
import { deleteVideo, generateScript, generateStoryboard, publishVideo, renderDraft, saveMeta, saveScript, saveStoryboard } from "../actions";

type Init = { title: string; subject: string; topic: string; level: string; script: string; scenes: VideoScene[]; keyPoints: string[]; status: VideoStatus; renderInfo: string; rendered: boolean };

export function MediaEditor({ id, subjects, initial }: { id: string; subjects: string[]; initial: Init }) {
  const { t } = useT();
  const [meta, setMeta] = useState({ title: initial.title, subject: initial.subject, topic: initial.topic, level: initial.level });
  const [script, setScript] = useState(initial.script);
  const [scenes, setScenes] = useState(initial.scenes);
  const [keyPoints, setKeyPoints] = useState(initial.keyPoints.join("\n"));
  const [status, setStatus] = useState(initial.status);
  const [renderInfo, setRenderInfo] = useState(initial.renderInfo);
  const [rendered, setRendered] = useState(initial.rendered);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(initial.scenes.length ? (initial.rendered ? 3 : 2) : 1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; mock?: boolean } | void>, okText?: DictKey) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r && r.error) setMsg({ ok: false, text: t(`p6.err.${["quota", "blocked", "no_model", "exam_locked", "no_scenes", "not_rendered", "empty"].includes(r.error) ? r.error : "generic"}` as DictKey) });
      else if (okText) setMsg({ ok: true, text: t(okText) + (r && r.mock ? ` · ${t("p6.md.mock")}` : "") });
    });

  const editScene = (i: number, patch: Partial<VideoScene>) => {
    setScenes((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const move = (i: number, d: number) => {
    setScenes((s) => {
      const a = [...s];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
    setDirty(true);
  };
  const kpList = () => keyPoints.split("\n").map((k) => k.trim()).filter(Boolean);
  const saveBoard = () => run(async () => {
    const r = await saveStoryboard(id, scenes, kpList());
    if (!r.error) { setScenes(r.scenes!); setDirty(false); setRendered(false); if (status === "script") setStatus("storyboard"); }
    return r;
  }, "common.saved");

  const tabs = [
    { n: 1 as const, icon: FileText, label: t("p6.md.st.script") },
    { n: 2 as const, icon: Clapperboard, label: t("p6.md.st.storyboard") },
    { n: 3 as const, icon: Film, label: t("p6.md.st.draft") },
  ];

  return (
    <div className="mt-2 space-y-4" data-testid="media-editor">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-md flex-1 text-lg font-semibold" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} onBlur={() => run(() => saveMeta(id, meta))} aria-label={t("p6.md.titlePh")} />
        <select className="input w-auto" value={meta.subject} onChange={(e) => { const m = { ...meta, subject: e.target.value }; setMeta(m); run(() => saveMeta(id, m)); }} aria-label={t("bk.subject")}>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <input className="input w-32" value={meta.topic} onChange={(e) => setMeta({ ...meta, topic: e.target.value })} onBlur={() => run(() => saveMeta(id, meta))} placeholder={t("p6.md.topicPh")} />
        <span className={`badge ${status === "published" ? "bg-emerald-50 text-emerald-700" : ""}`} data-testid="media-status">{t(`p6.md.st.${status}` as DictKey)}</span>
        <button className="btn btn-sm btn-ghost ml-auto text-rose-700" onClick={() => window.confirm(t("p2.confirmDelete", { title: meta.title })) && start(() => deleteVideo(id))}><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tabs.map(({ n, icon: Icon, label }) => (
          <button key={n} role="tab" aria-selected={step === n} onClick={() => setStep(n)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${step === n ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-slate-500"}`} data-testid={`media-tab-${n}`}>
            <Icon className="h-4 w-4" /> {n}. {label}
          </button>
        ))}
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`} role="status">{msg.text}</p>}

      {step === 1 && (
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title mr-auto">{t("p6.md.scriptTitle")}</h2>
            <button className="btn btn-sm" disabled={pending} onClick={() => run(async () => { const r = await generateScript(id); if (r.script) setScript(r.script); return r; }, "p6.md.scriptDone")} data-testid="media-gen-script"><Sparkles className="h-4 w-4" /> {t("p6.md.genScript")}</button>
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => saveScript(id, script), "common.saved")}>{t("common.save")}</button>
          </div>
          <textarea className="input min-h-72 font-[inherit] leading-relaxed" value={script} onChange={(e) => setScript(e.target.value)} placeholder={t("p6.md.scriptPh")} data-testid="media-script" />
          <button className="btn btn-primary" disabled={pending || script.trim().length < 10} onClick={() => run(async () => { const r = await generateStoryboard(id, script); if (r.scenes) { setScenes(r.scenes); setKeyPoints((r.keyPoints ?? []).join("\n")); setStatus(r.status!); setRendered(false); setStep(2); } return r; }, "p6.md.boardDone")} data-testid="media-gen-board">
            <Clapperboard className="h-4 w-4" /> {pending ? t("p2.working") : t("p6.md.genBoard")}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          {scenes.length === 0 ? (
            <p className="card p-6 text-center text-sm text-slate-500">{t("p6.md.noBoard")}</p>
          ) : (
            <ol className="grid gap-3 md:grid-cols-2" data-testid="media-scenes">
              {scenes.map((s, i) => (
                <li key={i} className="card space-y-2 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-semibold">{i + 1}</span>
                    <input className="input w-14 py-1 text-center" value={s.emoji ?? ""} onChange={(e) => editScene(i, { emoji: e.target.value })} aria-label="emoji" />
                    <input className="input flex-1 py-1 font-medium" value={s.title} onChange={(e) => editScene(i, { title: e.target.value })} aria-label={t("p6.md.sceneTitle")} />
                    <input type="number" min={2} max={20} className="input w-16 py-1" value={s.seconds} onChange={(e) => editScene(i, { seconds: Number(e.target.value) })} aria-label={t("p6.md.seconds")} />
                    <span className="text-xs text-slate-400">s</span>
                  </div>
                  <label className="block text-xs text-slate-500">{t("p6.md.visual")}<textarea className="input mt-0.5 min-h-14 font-mono text-xs" value={s.visual} onChange={(e) => editScene(i, { visual: e.target.value })} /></label>
                  <label className="block text-xs text-slate-500">{t("p6.md.narration")}<textarea className="input mt-0.5 min-h-14" value={s.narration} onChange={(e) => editScene(i, { narration: e.target.value })} /></label>
                  <div className="flex gap-1">
                    <button className="btn btn-sm btn-ghost" onClick={() => move(i, -1)} aria-label="up"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button className="btn btn-sm btn-ghost" onClick={() => move(i, 1)} aria-label="down"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button className="btn btn-sm btn-ghost ml-auto text-rose-700" onClick={() => { setScenes((x) => x.filter((_, j) => j !== i)); setDirty(true); }}>{t("common.delete")}</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="card p-3 text-sm">
            <label className="block font-medium">{t("p6.vid.keyPoints")}<textarea className="input mt-1 min-h-20" value={keyPoints} onChange={(e) => { setKeyPoints(e.target.value); setDirty(true); }} placeholder={t("p6.md.kpPh")} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => { setScenes((s) => [...s, { title: t("p6.md.newScene"), visual: "", narration: "", seconds: 5, emoji: "🎬" }]); setDirty(true); }}><Plus className="h-4 w-4" /> {t("p6.md.addScene")}</button>
            <button className="btn" disabled={pending || !dirty} onClick={saveBoard}>{t("common.save")}</button>
            <button className="btn btn-primary" disabled={pending || scenes.length < 2} onClick={() => run(async () => { if (dirty) { const s = await saveStoryboard(id, scenes, kpList()); if (s.error) return s; setDirty(false); } const r = await renderDraft(id); if (!r.error) { setStatus(r.status!); setRenderInfo(r.renderInfo!); setRendered(true); setStep(3); } return r; }, "p6.md.renderDone")} data-testid="media-render">
              <Film className="h-4 w-4" /> {pending ? t("p6.md.rendering") : t("p6.md.render")}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          {rendered ? <ScenePlayer scenes={scenes} title={meta.title} /> : <p className="card p-6 text-center text-sm text-slate-500">{t("p6.md.notRendered")}</p>}
          <aside className="card h-fit space-y-3 p-4 text-sm">
            <h2 className="font-semibold">{t("p6.md.draftInfo")}</h2>
            <p className="text-xs text-slate-500" data-testid="media-render-info">{renderInfo || "—"}</p>
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{t("p6.md.mockNote")}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs">{kpList().map((k, i) => <li key={i}>{k}</li>)}</ul>
            {status === "published" ? (
              <button className="btn w-full" disabled={pending} onClick={() => run(async () => { const r = await publishVideo(id, false); if (r.status) setStatus(r.status); return r; }, "p6.md.unpublished")}>{t("p6.md.unpublish")}</button>
            ) : (
              <button className="btn btn-primary w-full" disabled={pending || !rendered} onClick={() => run(async () => { const r = await publishVideo(id, true); if (r.status) setStatus(r.status); return r; }, "p6.md.publishedOk")} data-testid="media-publish">{t("p6.md.publish")}</button>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}
