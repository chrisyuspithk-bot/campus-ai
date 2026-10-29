import { requireApiUser } from "@/lib/auth/dal";
import { audit, queryAudit } from "@/lib/audit";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // Quote, and neutralise spreadsheet formulas (=, +, -, @) in user-controlled text.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** CSV export of the activity log with the same filters as /a/logs. */
export async function GET(req: Request) {
  const user = await requireApiUser(["admin"]);
  if (user instanceof Response) return user;
  const sp = new URL(req.url).searchParams;
  const filter = { action: sp.get("action") ?? "", from: sp.get("from") ?? "", to: sp.get("to") ?? "" };
  const rows = queryAudit(filter, 50_000);
  audit(user, "logs.export", "", `${rows.length} rows ${JSON.stringify(filter)}`);
  const lines = [
    ["time", "actor", "role", "action", "target", "detail"].join(","),
    ...rows.map((r) => [r.createdAt.toISOString(), r.actorName, r.actorRole, r.action, r.target, r.detail].map(cell).join(",")),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campus-ai-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
