import { requireApiUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { classAssignments, classReport } from "@/lib/p4/stats";

function cell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Class report CSV (UTF-8 with BOM so Excel opens Chinese correctly). */
export async function GET(_req: Request, ctx: RouteContext<"/api/reports/class/[id]">) {
  const user = await requireApiUser(["teacher", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const c = getClass(id);
  if (!canManageClass(user, c)) return Response.json({ error: "forbidden" }, { status: 403 });
  const assignments = classAssignments(c.id);
  const rows = classReport(c.id);
  const header = ["username", "name", ...assignments.map((a) => a.title), "submitted", "assignments", "avg_pct", "streak_days", "chats_7d", "tokens_7d", "wrongbook_open", "last_login"];
  const lines = [header, ...rows.map((r) => [
    r.username, r.displayName, ...assignments.map((a) => r.scores[a.id]), r.submitted, r.total, r.avg ?? "", r.streak, r.chats7d, r.tokens7d, r.wrongOpen, r.lastLoginAt ? r.lastLoginAt.toISOString() : "",
  ])].map((l) => l.map(cell).join(","));
  audit(user, "report.export", `${c.name} ${c.subject}`, `${rows.length} rows`);
  const name = `class-report-${c.name}-${c.subject}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="class-report.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
