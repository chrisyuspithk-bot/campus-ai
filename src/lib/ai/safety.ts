import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PolicyAction, PolicyCategory, RiskLevel } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { notifyHighRisk } from "@/lib/p7/notify";

// P2: rules live in the `policy_rules` table and are managed at /a/policies.
// These built-ins are the seed set and the fallback if the table is empty.
export const DEFAULT_RULES: { category: PolicyCategory; pattern: string; isRegex: boolean; action: PolicyAction; level: RiskLevel }[] = [
  { category: "selfharm", pattern: "自殺|自殘|想死|唔想生存|割脈|輕生", isRegex: true, action: "block", level: "high" },
  { category: "selfharm", pattern: "\\b(suicide|kill myself|self[- ]harm|end my life)\\b", isRegex: true, action: "block", level: "high" },
  { category: "violence", pattern: "(製造|整|做).{0,4}(炸彈|炸藥|槍械)", isRegex: true, action: "block", level: "high" },
  { category: "violence", pattern: "\\b(make|build)\\s+(a\\s+)?(bomb|explosive|gun)\\b", isRegex: true, action: "block", level: "high" },
  { category: "bullying", pattern: "杰仔|廢柴|打佢|欺凌|蝦人", isRegex: true, action: "flag", level: "medium" },
  { category: "bullying", pattern: "\\b(loser|bully|beat (him|her) up)\\b", isRegex: true, action: "flag", level: "medium" },
  { category: "sexual", pattern: "色情|裸照|porn|nude", isRegex: true, action: "block", level: "high" },
  { category: "cheating", pattern: "考試答案|幫我作弊|代寫|exam answers|write my (essay|homework)", isRegex: true, action: "flag", level: "low" },
];

export type SafetyResult = {
  /** true when the message must not reach the model */
  blocked: boolean;
  /** strongest matching rule, if any (block beats flag; high beats low) */
  hit?: { category: PolicyCategory; level: RiskLevel; action: PolicyAction; pattern: string };
  reason?: string;
};

const LEVEL_RANK: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1 };

function activeRules() {
  const rows = db.select().from(schema.policyRules).where(eq(schema.policyRules.enabled, true)).orderBy(desc(schema.policyRules.createdAt)).all();
  return rows.length || db.select({ id: schema.policyRules.id }).from(schema.policyRules).limit(1).get() ? rows : DEFAULT_RULES;
}

function matches(rule: { pattern: string; isRegex: boolean }, text: string) {
  if (!rule.pattern.trim()) return false;
  if (!rule.isRegex) return text.toLowerCase().includes(rule.pattern.toLowerCase());
  try {
    return new RegExp(rule.pattern, "i").test(text);
  } catch {
    return false; // invalid regex saved by an admin: ignore rather than break chat
  }
}

/** Run text through the school policy. Pure check — use `recordSafety` to open a case. */
export function checkSafety(text: string): SafetyResult {
  let best: SafetyResult["hit"];
  for (const r of activeRules()) {
    if (!matches(r, text)) continue;
    const better =
      !best ||
      (r.action === "block" && best.action !== "block") ||
      (r.action === best.action && LEVEL_RANK[r.level] > LEVEL_RANK[best.level]);
    if (better) best = { category: r.category, level: r.level, action: r.action, pattern: r.pattern };
  }
  if (!best) return { blocked: false };
  return { blocked: best.action === "block", hit: best, reason: `${best.category}:${best.pattern.slice(0, 40)}` };
}

/** Open a risk case (/a/safety) for a hit, and keep the P1 `events` metric in sync for blocks. */
export function recordSafety(opts: {
  userId: string;
  result: SafetyResult;
  source: "chat" | "essay" | "studio" | "create" | "report" | "bank" | "grading" | "practice" | "media" | "research" | "drafts";
  text: string;
  modelId?: string | null;
  refId?: string | null;
}) {
  const hit = opts.result.hit;
  if (!hit) return;
  const caseId = newId();
  db.insert(schema.safetyCases)
    .values({
      id: caseId,
      userId: opts.userId,
      level: hit.level,
      category: hit.category,
      source: opts.source,
      matched: hit.pattern.slice(0, 120),
      excerpt: opts.text.slice(0, 1200),
      modelId: opts.modelId ?? null,
      blocked: opts.result.blocked,
      refId: opts.refId ?? null,
    })
    .run();
  if (opts.result.blocked) {
    db.insert(schema.events).values({ type: "blocked", userId: opts.userId, detail: opts.result.reason ?? "" }).run();
  }
  // P7: high-risk cases are auto-reported (audit + admin / class-teacher notices, masked).
  if (hit.level === "high") notifyHighRisk({ id: caseId, userId: opts.userId, category: hit.category, source: opts.source, blocked: opts.result.blocked });
}

/** Copy the built-in rules into `policy_rules` the first time an admin opens /a/policies. */
export function ensurePolicyRules() {
  if (db.select({ id: schema.policyRules.id }).from(schema.policyRules).limit(1).get()) return;
  db.insert(schema.policyRules).values(DEFAULT_RULES.map((r) => ({ id: newId(), ...r }))).run();
}
