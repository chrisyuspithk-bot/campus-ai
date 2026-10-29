import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { listClassesFor } from "@/lib/p3/classes";
import { BANK_SUBJECTS } from "@/lib/p3/bank";
import { SubmitButton } from "@/components/SubmitButton";
import { Page, PageHeader, SectionHeader } from "@/components/ui";
import { createClass, savePermissions } from "./actions";
import { permMatrix, PERM_ROLES, PERMS } from "@/lib/p6/org";
import type { DictKey } from "@/lib/i18n/dict";

export const metadata: Metadata = { title: "架構／權限" };

export default async function OrgPage() {
  await requireUser(["admin"]);
  const { t } = await getT();
  const classes = listClassesFor(null);
  const teachers = db.select().from(schema.users).where(eq(schema.users.role, "teacher")).orderBy(asc(schema.users.username)).all();
  const tName = new Map(teachers.map((x) => [x.id, `${x.avatar} ${x.displayName}`]));
  const LEVELS = ["S1", "S2", "S3", "S4", "S5", "S6"];
  const subjects = [...new Set([...BANK_SUBJECTS, ...classes.map((c) => c.subject)])];
  const cell = (lv: string, sub: string) => classes.filter((c) => c.level === lv && c.subject === sub);
  const students = db.select({ group: schema.users.group }).from(schema.users).where(eq(schema.users.role, "student")).all();
  const perLevel = new Map<string, number>();
  for (const s of students) {
    const lv = s.group && /^\d/.test(s.group) ? `S${s.group[0]}` : "";
    if (lv) perLevel.set(lv, (perLevel.get(lv) ?? 0) + 1);
  }
  const matrix = permMatrix();

  return (
    <Page wide>
      <PageHeader title={t("org.title")} subtitle={t("org.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <SectionHeader title={t("org.classes")} />
          <div className="card overflow-x-auto">
            <table className="table-base" data-testid="org-classes">
              <thead><tr><th>{t("asg.col.class")}</th><th>{t("bk.subject")}</th><th>{t("org.level")}</th><th>{t("org.teacher")}</th><th>{t("org.members")}</th><th>{t("asg.tab.active")}</th></tr></thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.emoji} {c.name}</td><td>{c.subject}</td><td>{c.level}</td>
                    <td>{c.teacherId ? tName.get(c.teacherId) : <span className="text-slate-400">{t("org.noTeacher")}</span>}</td>
                    <td>{c.memberCount}</td><td>{c.activeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionHeader title={t("p6.org.grid")} />
          <div className="card mb-6 overflow-x-auto">
            <table className="table-base text-xs" data-testid="org-grid">
              <thead><tr><th>{t("org.level")}</th><th className="text-right">{t("p6.org.students")}</th>{subjects.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {LEVELS.map((lv) => (
                  <tr key={lv}>
                    <td className="font-semibold">{lv}</td>
                    <td className="text-right tabular-nums">{perLevel.get(lv) ?? 0}</td>
                    {subjects.map((sub) => {
                      const cs = cell(lv, sub);
                      return (
                        <td key={sub} className={cs.length ? "bg-brand-50/60" : "text-slate-300"}>
                          {cs.length ? cs.map((c) => <div key={c.id} title={c.teacherId ? tName.get(c.teacherId) : t("org.noTeacher")}>{c.name} <span className="text-slate-500">({c.memberCount})</span>{!c.teacherId && <span className="text-rose-500"> !</span>}</div>) : "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionHeader title={t("p6.org.perms")} />
          <form action={savePermissions} className="card mb-6 overflow-x-auto" data-testid="org-perms">
            <table className="table-base text-sm">
              <thead><tr><th>{t("p6.org.capability")}</th>{(["student", "teacher", "admin"] as const).map((r) => <th key={r} className="text-center">{t(`role.${r}`)}</th>)}</tr></thead>
              <tbody>
                {PERMS.map((p) => (
                  <tr key={p}>
                    <td><div className="font-medium">{t(`p6.perm.${p}` as DictKey)}</div><div className="text-xs text-slate-400">{p}</div></td>
                    {(["student", "teacher", "admin"] as const).map((r) => (
                      <td key={r} className="text-center">
                        {r === "admin" ? <span className="text-emerald-600" title={t("p6.org.adminAlways")}>✓</span> : PERM_ROLES[p].includes(r) ? (
                          <input type="checkbox" name={`${p}:${r}`} defaultChecked={matrix[p].includes(r)} aria-label={`${p} · ${r}`} className="h-4 w-4 accent-brand-600" />
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-3 border-t border-slate-100 p-3"><SubmitButton>{t("common.save")}</SubmitButton><span className="text-xs text-slate-500">{t("p6.org.permsNote")}</span></div>
          </form>
          <SectionHeader title={t("org.roles")} />
          <ul className="card divide-y divide-slate-100 text-sm">
            {(["student", "teacher", "admin"] as const).map((r) => (
              <li key={r} className="flex gap-3 px-4 py-3"><span className="badge w-16 justify-center">{t(`role.${r}`)}</span><span className="text-slate-600">{t(`org.role.${r}`)}</span></li>
            ))}
          </ul>
        </section>
        <form action={createClass} className="card h-fit space-y-3 p-4">
          <h2 className="section-title">{t("org.newClass")}</h2>
          <input name="name" className="input" placeholder={t("org.name")} required />
          <select name="subject" className="input" aria-label={t("bk.subject")}>{BANK_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
          <select name="level" className="input" aria-label={t("org.level")}>{["S1", "S2", "S3", "S4", "S5", "S6"].map((s) => <option key={s}>{s}</option>)}</select>
          <select name="teacherId" className="input" aria-label={t("org.teacher")}>
            <option value="">{t("org.noTeacher")}</option>
            {teachers.map((x) => <option key={x.id} value={x.id}>{x.displayName}（{x.username}）</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="addGroup" defaultChecked /> {t("org.addGroup")}</label>
          <SubmitButton>{t("org.create")}</SubmitButton>
        </form>
      </div>
    </Page>
  );
}
