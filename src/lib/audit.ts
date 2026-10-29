import "server-only";
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";

type Actor = { id: string; displayName: string; role: string } | null;

/** Append an admin/teacher operation to the activity log (/a/logs). Never throws. */
export function audit(actor: Actor, action: string, target = "", detail = "") {
  try {
    db.insert(schema.auditLogs)
      .values({
        actorId: actor?.id ?? null,
        actorName: actor?.displayName ?? "system",
        actorRole: actor?.role ?? "",
        action,
        target: target.slice(0, 200),
        detail: detail.slice(0, 500),
      })
      .run();
  } catch (e) {
    console.error("audit failed", e);
  }
}

/** Actions shown in the /a/logs filter. Keep in sync with i18n keys `log.a.<action>`. */
export const AUDIT_ACTIONS = [
  "login",
  "features.save",
  "models.save",
  "models.delete",
  "quotas.save",
  "quota.override",
  "users.create",
  "users.import",
  "users.batch",
  "users.yearEnd",
  "settings.save",
  "tutor.publish",
  "tutor.unpublish",
  "tutor.delete",
  "policy.add",
  "policy.update",
  "policy.delete",
  "policy.settings",
  "safety.resolve",
  "safety.escalate",
  "safety.reopen",
  "essay.return",
  "logs.export",
  "logs.purge",
  "assignment.create",
  "assignment.close",
  "assignment.delete",
  "paper.save",
  "community.share",
  "community.approve",
  "community.reject",
  "class.create",
  "grade.done",
  "report.export",
  "safety.auto_high",
  "safety.export",
  "photo.practice",
  "research.run",
  "draft.ai",
] as const;

export type AuditFilter = { action?: string; from?: string; to?: string };

/** /a/logs + CSV export. `from`/`to` are YYYY-MM-DD dates in school (HK) time, both inclusive. */
export function queryAudit(f: AuditFilter, limit: number) {
  const a = schema.auditLogs;
  const conds: SQL[] = [];
  if (f.action && (AUDIT_ACTIONS as readonly string[]).includes(f.action)) conds.push(eq(a.action, f.action));
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+08:00`) : null);
  const from = day(f.from);
  const to = day(f.to);
  if (from) conds.push(gte(a.createdAt, from));
  if (to) conds.push(lt(a.createdAt, new Date(to.getTime() + 86_400_000)));
  return db.select().from(a).where(conds.length ? and(...conds) : undefined).orderBy(desc(a.createdAt)).limit(limit).all();
}
