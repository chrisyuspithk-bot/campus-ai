"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import type { PolicyAction, PolicyCategory, RiskLevel } from "@/lib/db/schema";

const CATEGORIES: PolicyCategory[] = ["selfharm", "bullying", "sexual", "cheating", "violence", "other"];
const LEVELS: RiskLevel[] = ["high", "medium", "low"];

function fields(form: FormData) {
  const category = String(form.get("category")) as PolicyCategory;
  const level = String(form.get("level")) as RiskLevel;
  return {
    category: CATEGORIES.includes(category) ? category : "other",
    pattern: String(form.get("pattern") ?? "").trim().slice(0, 500),
    isRegex: form.get("isRegex") === "on",
    action: (form.get("action") === "block" ? "block" : "flag") as PolicyAction,
    level: LEVELS.includes(level) ? level : "medium",
    enabled: form.get("enabled") === "on",
  };
}

function validRegex(f: { pattern: string; isRegex: boolean }) {
  if (!f.isRegex) return true;
  try {
    new RegExp(f.pattern, "i");
    return true;
  } catch {
    return false;
  }
}

export async function addRule(form: FormData) {
  const me = await requireUser(["admin"]);
  const f = { ...fields(form), enabled: true };
  if (!f.pattern) return;
  if (!validRegex(f)) return appRedirect("/a/policies?error=regex");
  db.insert(schema.policyRules).values({ id: newId(), ...f }).run();
  audit(me, "policy.add", `${f.category}/${f.action}`, f.pattern);
  revalidatePath("/a/policies");
}

export async function updateRule(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = String(form.get("id") ?? "");
  if (form.get("op") === "delete") {
    const r = db.select().from(schema.policyRules).where(eq(schema.policyRules.id, id)).get();
    db.delete(schema.policyRules).where(eq(schema.policyRules.id, id)).run();
    if (r) audit(me, "policy.delete", `${r.category}/${r.action}`, r.pattern);
    return revalidatePath("/a/policies");
  }
  const f = fields(form);
  if (!f.pattern) return;
  if (!validRegex(f)) return appRedirect("/a/policies?error=regex");
  db.update(schema.policyRules).set(f).where(eq(schema.policyRules.id, id)).run();
  audit(me, "policy.update", `${f.category}/${f.action}${f.enabled ? "" : " (off)"}`, f.pattern);
  revalidatePath("/a/policies");
}
