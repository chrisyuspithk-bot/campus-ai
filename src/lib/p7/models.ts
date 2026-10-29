// P7 multi-model catalogue (G1) and image-model status (G6).
// Probed against this deployment's OpenRouter key on 2026-10-28: DeepSeek, Qwen, Kimi (Moonshot), MiniMax, GLM, Grok
// and Llama answer; Google / OpenAI / Anthropic return 403 "violation of provider Terms Of Service" — including every
// image-output model OpenRouter lists — so those rows stay disabled with a note and image generation stays a badged demo.

import type { Role } from "@/lib/db/schema";

export type CatalogueModel = {
  id: string;
  displayName: string;
  openrouterId: string;
  description: string;
  roles: Role[];
  enabled: boolean;
  sortOrder: number;
};

const ALL: Role[] = ["student", "teacher", "admin"];
const STAFF: Role[] = ["teacher", "admin"];
export const BLOCKED_NOTE = "⚠ 此 API key 對該供應商回 403（供應商條款限制），已停用；key 開通後管理員可啟用。";

/** Seeded into `models` by scripts/seed-p7.ts (the three P1 ids are re-pointed, the rest added). */
export const P7_MODELS: CatalogueModel[] = [
  { id: "campus-fast", displayName: "校園快速 · DeepSeek", openrouterId: "deepseek/deepseek-v4.1-flash-1017", description: "DeepSeek V4.1 Flash：快、慳配額，日常溫習同快速解答", roles: ALL, enabled: true, sortOrder: 1 },
  { id: "campus-light", displayName: "校園通用 · Qwen", openrouterId: "qwen/qwen3.8-flash", description: "通義千問 Qwen 3.8 Flash：中文表達自然，一般問答同寫作", roles: ALL, enabled: true, sortOrder: 2 },
  { id: "campus-minimax", displayName: "校園極速 · MiniMax", openrouterId: "minimax/minimax-m3.1-flash", description: "MiniMax M3.1 Flash：回應最快，適合短問短答", roles: ALL, enabled: true, sortOrder: 3 },
  { id: "campus-strong", displayName: "校園深度 · Kimi", openrouterId: "moonshotai/kimi-k3", description: "Kimi K3：較慢但推理較深，適合備課、長文同複雜推理", roles: STAFF, enabled: true, sortOrder: 4 },
  { id: "campus-glm", displayName: "智譜 GLM", openrouterId: "z-ai/glm-5.3-flash", description: "GLM 5.3 Flash：後備模型（預設停用，可於此啟用）", roles: STAFF, enabled: false, sortOrder: 5 },
  { id: "brand-gemini", displayName: "Google Gemini", openrouterId: "google/gemini-3.8-flash", description: BLOCKED_NOTE, roles: STAFF, enabled: false, sortOrder: 6 },
  { id: "brand-gpt", displayName: "OpenAI GPT", openrouterId: "openai/gpt-6-luna", description: BLOCKED_NOTE, roles: STAFF, enabled: false, sortOrder: 7 },
  { id: "brand-claude", displayName: "Anthropic Claude", openrouterId: "anthropic/claude-haiku-5.5", description: BLOCKED_NOTE, roles: STAFF, enabled: false, sortOrder: 8 },
];

/** Providers whose image models 403 on this key — treated like "no image model" so chat shows the badged demo. */
const REFUSED_IMAGE_PREFIXES = ["google/", "openai/", "openrouter/auto"];

/** True when the imageModel setting points at something worth calling (blank / "mock" / known-403 → demo image). */
export function imageModelLive(id: string) {
  const v = id.trim();
  if (!v || v === "mock") return false;
  if (process.env.OPENROUTER_IMAGE_FORCE === "1") return true;
  return !REFUSED_IMAGE_PREFIXES.some((p) => v.startsWith(p));
}
