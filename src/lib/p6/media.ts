import "server-only";
import type { VideoScene } from "@/lib/db/schema";
import { notesFor, TOPIC_ANIMATIONS } from "./topics";

export const MAX_SCENES = 10;
const EMOJI = ["🎬", "🔍", "💡", "✏️", "🧩", "✅", "📌", "🎯", "📊", "🔁"];

// ---- Script ----------------------------------------------------------------------------------------
export function scriptPrompt(v: { subject: string; topic: string; level: string; title: string }) {
  return {
    system: "Write the narration script for a 60–90 second classroom explainer video. Hong Kong secondary school; spoken Cantonese-style written Chinese unless the subject is English. 5–8 short paragraphs, one idea each: hook, concept, worked example, common mistake, recap. JSON: {\"script\": string} (paragraphs separated by blank lines).",
    prompt: `Subject: ${v.subject}\nTopic: ${v.topic}\nLevel: ${v.level}\nTitle: ${v.title}`,
  };
}

export function normalizeScript(raw: unknown): { script: string } | null {
  const s = (raw as { script?: unknown })?.script;
  return typeof s === "string" && s.trim().length > 20 ? { script: s.trim().slice(0, 6000) } : null;
}

export function mockScript(v: { subject: string; topic: string; title: string }) {
  const notes = notesFor(v.topic);
  const en = v.subject === "英文";
  const intro = en ? `Today: ${v.title}. Let's learn it in one minute.` : `今日一分鐘講解：「${v.title}」。`;
  const outro = en ? "Recap: say the rule in your own words, then try one practice question." : "總結：用自己嘅說話講一次重點，再去自主練習做一條相似題。";
  return { script: [intro, ...notes, outro].join("\n\n") };
}

// ---- Storyboard --------------------------------------------------------------------------------------
export function storyboardPrompt(script: string) {
  return {
    system: `Turn the narration script into a storyboard for a short explainer video. 3–${MAX_SCENES} scenes. Each scene: title (≤12 chars), visual (what is on screen: formula in $…$ LaTeX or ≤3 short lines), narration (the spoken line, from the script), seconds (3–12), emoji (one). Then 3–5 key points for students. JSON: {"scenes":[{"title","visual","narration","seconds","emoji"}],"keyPoints":[string]}`,
    prompt: script.slice(0, 6000),
  };
}

export function normalizeScenes(raw: unknown): VideoScene[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((s, i) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
      return {
        title: str(o.title, 40) || `Scene ${i + 1}`,
        visual: str(o.visual, 400),
        narration: str(o.narration, 600),
        seconds: Math.min(20, Math.max(2, Math.round(Number(o.seconds)) || 5)),
        emoji: str(o.emoji, 8) || EMOJI[i % EMOJI.length],
      };
    })
    .filter((s) => s.visual || s.narration)
    .slice(0, MAX_SCENES);
}

export function normalizeStoryboard(raw: unknown): { scenes: VideoScene[]; keyPoints: string[] } | null {
  const o = (raw ?? {}) as { scenes?: unknown; keyPoints?: unknown };
  const scenes = normalizeScenes(o.scenes);
  if (scenes.length < 2) return null;
  const keyPoints = Array.isArray(o.keyPoints) ? o.keyPoints.filter((k): k is string => typeof k === "string" && !!k.trim()).map((k) => k.trim().slice(0, 160)).slice(0, 6) : [];
  return { scenes, keyPoints: keyPoints.length ? keyPoints : keyPointsFrom(scenes) };
}

/** Rule-based storyboard: one scene per paragraph; formulas / the first clause become the visual. */
export function mockStoryboard(script: string, topic: string): { scenes: VideoScene[]; keyPoints: string[] } {
  const builtIn = TOPIC_ANIMATIONS[topic];
  const paras = script.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean).slice(0, MAX_SCENES);
  if (!paras.length && builtIn) return { scenes: builtIn, keyPoints: keyPointsFrom(builtIn) };
  const scenes = paras.map((p, i) => {
    const formula = p.match(/[0-9a-zA-Zα-ωΔ√²³±×÷()+\-−=/ ]{6,}/)?.[0]?.trim();
    const clause = p.split(/[，。：；,.:;!?！？]/)[0].slice(0, 14);
    return {
      title: clause || `第 ${i + 1} 幕`,
      visual: formula && formula.length > 5 ? formula : p.length > 40 ? `${p.slice(0, 38)}…` : p,
      narration: p,
      seconds: Math.min(12, Math.max(3, Math.round(p.length / 7))),
      emoji: EMOJI[i % EMOJI.length],
    };
  });
  return { scenes, keyPoints: keyPointsFrom(scenes) };
}

export function keyPointsFrom(scenes: VideoScene[]) {
  return scenes
    .slice(1)
    .map((s) => s.narration.split(/[。.!?！？]/)[0].trim())
    .filter((s) => s.length > 4)
    .slice(0, 4);
}

export const totalSeconds = (scenes: VideoScene[]) => scenes.reduce((s, x) => s + x.seconds, 0);
