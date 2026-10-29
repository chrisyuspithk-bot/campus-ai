import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { maskUser } from "@/lib/p7/notify";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** P7: CSV of safety cases with masked user ids and no excerpts (the full text stays in the admin detail view). */
export async function GET() {
  const user = await requireApiUser(["admin"]);
  if (user instanceof Response) return user;
  const c = schema.safetyCases;
  const rows = db.select({ c, username: schema.users.username }).from(c).leftJoin(schema.users, eq(schema.users.id, c.userId)).orderBy(desc(c.createdAt)).limit(20_000).all();
  audit(user, "safety.export", "", `${rows.length} rows`);
  const lines = [
    ["time", "case", "user", "level", "category", "source", "blocked", "status"].join(","),
    ...rows.map(({ c: r, username }) => [r.createdAt.toISOString(), r.id, maskUser(username), r.level, r.category, r.source, r.blocked ? "yes" : "no", r.status].map(cell).join(",")),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campus-ai-safety-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
