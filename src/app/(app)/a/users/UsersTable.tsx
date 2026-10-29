"use client";
import { useState } from "react";
import type { Role } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { batchUsers } from "../actions";

type Row = { id: string; displayName: string; username: string; role: Role; group: string | null; status: "active" | "disabled"; monthPct: number };

export function UsersTable({ users, meId }: { users: Row[]; meId: string }) {
  const { t } = useT();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectable = users.filter((u) => u.id !== meId);
  const all = selectable.length > 0 && selectable.every((u) => sel.has(u.id));

  return (
    <form action={async (fd) => { await batchUsers(fd); setSel(new Set()); }} className="card overflow-x-auto">
      {[...sel].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
        <span className="font-medium text-slate-600">{t("u.batch")}:</span>
        <span className="text-slate-500">{t("u.selected", { n: sel.size })}</span>
        <button name="op" value="disable" className="btn btn-sm" disabled={!sel.size}>{t("u.disable")}</button>
        <button name="op" value="enable" className="btn btn-sm" disabled={!sel.size}>{t("u.enable")}</button>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500">{t("u.setRole")}:</span>
        {(["student", "teacher", "admin"] as const).map((r) => (
          <button key={r} name="op" value={`role:${r}`} className="btn btn-sm" disabled={!sel.size}>{t(`role.${r}`)}</button>
        ))}
        <span className="text-slate-300">|</span>
        <button name="op" value="resetQuota" className="btn btn-sm" disabled={!sel.size}>{t("u.resetQuota")}</button>
      </div>
      <table className="table-base" data-testid="users-table">
        <thead>
          <tr>
            <th className="w-8">
              <input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(selectable.map((u) => u.id)))} aria-label={t("common.all")} />
            </th>
            <th>{t("u.name")}</th>
            <th>{t("u.login")}</th>
            <th>{t("u.role")}</th>
            <th>{t("u.group")}</th>
            <th>{t("common.status")}</th>
            <th>{t("u.monthUsage")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.status === "disabled" ? "text-slate-400" : ""}>
              <td>
                <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} disabled={u.id === meId} aria-label={u.displayName} />
              </td>
              <td className="font-medium">{u.displayName}</td>
              <td className="font-mono text-xs">{u.username}</td>
              <td>{t(`role.${u.role}`)}</td>
              <td>{u.group}</td>
              <td>
                <span className={`badge ${u.status === "active" ? "bg-teal-50 text-teal-700" : "bg-slate-200"}`}>
                  {u.status === "active" ? t("u.active") : t("u.disabled")}
                </span>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${u.monthPct >= 100 ? "bg-rose-500" : u.monthPct >= 80 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${u.monthPct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums">{u.monthPct}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </form>
  );
}
