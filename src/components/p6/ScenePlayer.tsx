"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { VideoScene } from "@/lib/db/schema";
import { Markdown } from "@/components/Markdown";

/**
 * Plays a storyboard as an animated short video: scenes advance on their timing, each visual line
 * animates in, the narration is shown as captions and (optionally) read aloud with the browser's TTS.
 * This is the "short-video draft" when no real render pipeline is configured.
 */
export function ScenePlayer({ scenes, title, autoPlay = false, onFinish }: { scenes: VideoScene[]; title?: string; autoPlay?: boolean; onFinish?: () => void }) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [voice, setVoice] = useState(false);
  const finished = useRef(false);
  const scene = scenes[idx];
  const total = scenes.reduce((s, x) => s + x.seconds, 0);
  const before = scenes.slice(0, idx).reduce((s, x) => s + x.seconds, 0);

  const speak = useCallback(
    (text: string) => {
      if (!voice || typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[一-鿿]/.test(text) ? "zh-HK" : "en-GB";
      u.rate = 1.05;
      speechSynthesis.speak(u);
    },
    [voice],
  );

  useEffect(() => {
    if (playing && scene) speak(scene.narration);
  }, [idx, playing, scene, speak]);
  useEffect(() => () => void (typeof speechSynthesis !== "undefined" && speechSynthesis.cancel()), []);

  useEffect(() => {
    if (!playing || !scene) return;
    const h = setInterval(() => {
      setElapsed((e) => {
        if (e + 0.1 < scene.seconds) return e + 0.1;
        if (idx + 1 < scenes.length) {
          setIdx(idx + 1);
          return 0;
        }
        setPlaying(false);
        if (!finished.current) {
          finished.current = true;
          onFinish?.();
        }
        return scene.seconds;
      });
    }, 100);
    return () => clearInterval(h);
  }, [playing, idx, scene, scenes.length, onFinish]);

  if (!scene) return <div className="card grid aspect-video place-items-center text-sm text-slate-500">{t("p6.noScenes")}</div>;

  const go = (i: number) => {
    setIdx(Math.max(0, Math.min(scenes.length - 1, i)));
    setElapsed(0);
  };
  const lines = scene.visual.split(/\n/).filter((l) => l.trim());

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="scene-player">
      <div className="relative aspect-video bg-gradient-to-br from-brand-50 via-white to-amber-50">
        {title && <div className="absolute top-3 left-4 text-xs font-medium text-slate-500">{title}</div>}
        <div className="absolute top-3 right-4 text-xs text-slate-400">{idx + 1} / {scenes.length}</div>
        <div key={idx} className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="p6-pop text-5xl" aria-hidden>{scene.emoji ?? "🎬"}</div>
          <div className="p6-rise text-lg font-semibold text-brand-800 sm:text-xl">{scene.title}</div>
          <div className="space-y-1 text-base sm:text-lg">
            {lines.map((l, i) => (
              <div key={i} className="p6-rise" style={{ animationDelay: `${0.35 + i * 0.6}s` }}><Markdown>{l}</Markdown></div>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-4 py-2 text-center text-sm text-white" data-testid="scene-caption">{scene.narration}</div>
      </div>
      <div className="flex gap-0.5 px-3 pt-2" aria-hidden>
        {scenes.map((s, i) => (
          <div key={i} className="h-1.5 overflow-hidden rounded-full bg-slate-200" style={{ flex: s.seconds }}>
            <div className="h-full bg-brand-500" style={{ width: i < idx ? "100%" : i === idx ? `${Math.min(100, (elapsed / s.seconds) * 100)}%` : "0%" }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 p-2">
        <button className="btn btn-sm btn-ghost" onClick={() => go(idx - 1)} aria-label={t("p6.prev")}><SkipBack className="h-4 w-4" /></button>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => {
            if (!playing && idx === scenes.length - 1 && elapsed >= scene.seconds) go(0);
            setPlaying(!playing);
            if (playing && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
          }}
          data-testid="scene-play"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? t("p6.pause") : t("p6.play")}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => go(idx + 1)} aria-label={t("p6.next")}><SkipForward className="h-4 w-4" /></button>
        <button className="btn btn-sm btn-ghost" onClick={() => { go(0); setPlaying(true); }} aria-label={t("p6.restart")}><RotateCcw className="h-4 w-4" /></button>
        <button className={`btn btn-sm ${voice ? "" : "btn-ghost"}`} onClick={() => setVoice(!voice)} title={t("p6.voice")}>
          {voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {t("p6.voice")}
        </button>
        <span className="ml-auto text-xs text-slate-500 tabular-nums">{fmt(before + elapsed)} / {fmt(total)}</span>
      </div>
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
