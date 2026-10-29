import type { Metadata } from "next";
import { and, asc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { limitsFor } from "@/lib/quota";
import { monthPrefix } from "@/lib/time";
import { Page, PageHeader } from "@/components/ui";
import { UsersTable } from "./UsersTable";
import { UserTools } from "./UserTools";

export const metadata: Metadata = { title: "用戶與角色" };
const ROLES: Role[] = ["student", "teacher", "admin"];

export default async function UsersPage({ searchParams }: PageProps<"/a/users">) {
  const me = await requireUser(["admin"]);
  const { t } = await getT();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const role = typeof sp.role === "string" && ROLES.includes(sp.role as Role) ? (sp.role as Role) : "";

  const u = schema.users;
  const conds: SQL[] = [];
  if (q) conds.push(or(like(u.displayName, `%${q}%`), like(u.username, `%${q}%`))!);
  if (role) conds.push(eq(u.role, role));
  const users = db.select().from(u).where(conds.length ? and(...conds) : undefined).orderBy(asc(u.role), asc(u.username)).all();
  const monthUsage = new Map(
    db
      .select({ userId: schema.usage.userId, tokens: sql<number>`sum(${schema.usage.tokens})` })
      .from(schema.usage)
      .where(like(schema.usage.day, `${monthPrefix()}%`))
      .groupBy(schema.usage.userId)
      .all()
      .map((r) => [r.userId, r.tokens]),
  );

  return (
    <Page wide>
      <PageHeader title={t("u.title")} />
      <UserTools />
      <form className="mb-3 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} type="search" placeholder={t("u.searchPh")} className="input max-w-xs" aria-label={t("u.searchPh")} />
        <select name="role" defaultValue={role} className="input w-auto" aria-label={t("u.role")}>
          <option value="">{t("common.all")}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
        </select>
        <button className="btn">{t("common.search")}</button>
      </form>
      <UsersTable
        meId={me.id}
        users={users.map((x) => {
          const lim = limitsFor(x.id, x.role).monthlyTokens;
          const used = monthUsage.get(x.id) ?? 0;
          return {
            id: x.id,
            displayName: x.displayName,
            username: x.username,
            role: x.role,
            group: x.group,
            status: x.status,
            monthPct: lim > 0 ? Math.min(100, Math.round((used / lim) * 100)) : 100,
          };
        })}
      />
    </Page>
  );
}
