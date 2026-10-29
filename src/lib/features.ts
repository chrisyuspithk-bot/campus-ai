import "server-only";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { isUnlocked } from "@/lib/phase";

export const FEATURE_KEYS = [
  "ai_chat",
  "tutors",
  "studio",
  "essay",
  "create",
  "youtube",
  "image_gen",
  "tts",
  "web_search",
  "exam_lock",
  "media",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureMap = Record<FeatureKey, boolean>;

export function listFeatures() {
  return db.select().from(schema.features).orderBy(asc(schema.features.sortOrder)).all();
}

/** Effective on/off per feature for a role. Admins get every unlocked feature; locked phases are always off. */
export function featuresFor(role: Role): FeatureMap {
  const rows = listFeatures();
  const map = Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as FeatureMap;
  for (const r of rows) {
    if (!(FEATURE_KEYS as readonly string[]).includes(r.key)) continue;
    const key = r.key as FeatureKey;
    if (!isUnlocked(r.phase)) continue;
    map[key] = role === "admin" ? true : role === "teacher" ? r.teacherEnabled : r.studentEnabled;
  }
  return map;
}
