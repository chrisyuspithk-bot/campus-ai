import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { dayKey, monthPrefix } from "@/lib/time";

export type QuotaLimits = { dailyTokens: number; monthlyTokens: number; imagesPerDay: number };
export type QuotaStatus = QuotaLimits & {
  usedToday: number;
  usedMonth: number;
  imagesToday: number;
  /** 0–100, the higher of daily/monthly usage */
  percent: number;
  exhausted: boolean;
  imagesExhausted: boolean;
};

export function limitsFor(userId: string, role: Role): QuotaLimits {
  const o = db.select().from(schema.quotaOverrides).where(eq(schema.quotaOverrides.userId, userId)).get();
  if (o) return { dailyTokens: o.dailyTokens, monthlyTokens: o.monthlyTokens, imagesPerDay: o.imagesPerDay };
  const q = db.select().from(schema.quotas).where(eq(schema.quotas.role, role)).get();
  return q ?? { dailyTokens: 50_000, monthlyTokens: 1_000_000, imagesPerDay: 5 };
}

export function quotaStatus(userId: string, role: Role): QuotaStatus {
  const limits = limitsFor(userId, role);
  const today = db
    .select()
    .from(schema.usage)
    .where(and(eq(schema.usage.userId, userId), eq(schema.usage.day, dayKey())))
    .get();
  const month = db
    .select({ tokens: sql<number>`coalesce(sum(${schema.usage.tokens}), 0)` })
    .from(schema.usage)
    .where(and(eq(schema.usage.userId, userId), like(schema.usage.day, `${monthPrefix()}%`)))
    .get();
  const usedToday = today?.tokens ?? 0;
  const usedMonth = month?.tokens ?? 0;
  const imagesToday = today?.images ?? 0;
  const pct = (used: number, lim: number) => (lim <= 0 ? 100 : (used / lim) * 100);
  const percent = Math.min(100, Math.round(Math.max(pct(usedToday, limits.dailyTokens), pct(usedMonth, limits.monthlyTokens))));
  return {
    ...limits,
    usedToday,
    usedMonth,
    imagesToday,
    percent,
    exhausted: usedToday >= limits.dailyTokens || usedMonth >= limits.monthlyTokens,
    imagesExhausted: imagesToday >= limits.imagesPerDay,
  };
}

export function recordUsage(userId: string, tokens: number, images = 0) {
  db.insert(schema.usage)
    .values({ userId, day: dayKey(), tokens, requests: 1, images })
    .onConflictDoUpdate({
      target: [schema.usage.userId, schema.usage.day],
      set: {
        tokens: sql`${schema.usage.tokens} + ${tokens}`,
        requests: sql`${schema.usage.requests} + 1`,
        images: sql`${schema.usage.images} + ${images}`,
      },
    })
    .run();
}
