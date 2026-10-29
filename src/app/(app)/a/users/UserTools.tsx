"use client";
import { useActionState, useState } from "react";
import { RefreshCw, Upload, UserPlus, CalendarX } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { createUser, importCsv, yearEnd, type UserActionState } from "../actions";

type Panel = "manual" | "csv" | "sso" | "yearEnd" | null;

export function UserTools() {
  const { t } = useT();
  const [panel, setPanel] = useState<Panel>(null);
  const [createState, createAction, creating] = useActionState<UserActionState, FormData>(createUser, {});
  const [csvState, csvAction, importing] = useActionState<UserActionState, FormData>(importCsv, {});
  const [yeState, yeAction, clearing] = useActionState<UserActionState, FormData>(yearEnd, {});
  const csvResult = csvState.message ? (JSON.parse(csvState.message) as { n: number; skip: number }) : null;
  const tab = (p: Panel, icon: React.ReactNode, label: string) => (
    <button type="button" className={`btn ${panel === p ? "btn-primary" : ""}`} onClick={() => setPanel(panel === p ? null : p)}>
      {icon} {label}
    </button>
  );

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {tab("sso", <RefreshCw className="h-4 w-4" />, t("u.ssoSync"))}
        {tab("csv", <Upload className="h-4 w-4" />, t("u.import"))}
        {tab("manual", <UserPlus className="h-4 w-4" />, t("u.manual"))}
        <div className="flex-1" />
        {tab("yearEnd", <CalendarX className="h-4 w-4" />, t("u.yearEnd"))}
      </div>

      {panel === "sso" && <p className="card mt-3 p-4 text-sm text-slate-600">{t("u.ssoHint")}</p>}

      {panel === "manual" && (
        <form action={createAction} className="card mt-3 flex flex-wrap items-end gap-2 p-4">
          <div><label className="label" htmlFor="nu">{t("u.login")}</label><input id="nu" name="username" required pattern="[a-zA-Z0-9._\-]{2,40}" className="input w-32" /></div>
          <div><label className="label" htmlFor="nd">{t("u.name")}</label><input id="nd" name="displayName" required className="input w-36" /></div>
          <div>
            <label className="label" htmlFor="nr">{t("u.role")}</label>
            <select id="nr" name="role" className="input w-28">
              <option value="student">{t("role.student")}</option>
              <option value="teacher">{t("role.teacher")}</option>
              <option value="admin">{t("role.admin")}</option>
            </select>
          </div>
          <div><label className="label" htmlFor="ng">{t("u.group")}</label><input id="ng" name="group" className="input w-24" /></div>
          <div><label className="label" htmlFor="np">{t("u.password")}</label><input id="np" name="password" type="password" minLength={8} required className="input w-36" /></div>
          <button className="btn btn-primary" disabled={creating}>{t("common.add")}</button>
          {createState.error && <p className="w-full text-sm text-rose-600">{createState.error === "exists" ? t("u.exists") : t("me.passwordShort")}</p>}
          {createState.message && <p className="w-full text-sm text-teal-700">✓ {t("common.saved")}</p>}
        </form>
      )}

      {panel === "csv" && (
        <form action={csvAction} className="card mt-3 space-y-2 p-4">
          <p className="text-sm text-slate-600">{t("u.csvHint")}</p>
          <textarea name="csv" rows={4} className="input font-mono text-xs" placeholder={"s301,陳小美,student,3B,changeme123\nt20,李老師,teacher,中文,changeme123"} />
          <div className="flex items-center gap-2">
            <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
            <button className="btn btn-primary" disabled={importing}>{t("u.import")}</button>
          </div>
          {csvResult && <p className="text-sm text-teal-700">{t("u.csvResult", { n: csvResult.n, skip: csvResult.skip })}</p>}
        </form>
      )}

      {panel === "yearEnd" && (
        <form action={yeAction} className="card mt-3 space-y-3 border-rose-200 p-4">
          <p className="text-sm text-slate-700">{t("u.yearEndDesc")}</p>
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="archive" defaultChecked /> {t("u.yearEndArchive")}</label>
            <label className="flex items-center gap-2 text-rose-700"><input type="radio" name="mode" value="delete" /> {t("u.yearEndDelete")}</label>
          </div>
          <div className="flex items-center gap-2">
            <input name="confirm" placeholder={t("u.yearEndConfirm")} className="input w-56" aria-label={t("u.yearEndConfirm")} />
            <button className="btn btn-danger" disabled={clearing}>{t("common.confirm")}</button>
          </div>
          {yeState.error && <p className="text-sm text-rose-600">{t("u.yearEndConfirm")}</p>}
          {yeState.message && <p className="text-sm text-teal-700">{t("u.yearEndDone", { n: yeState.message })}</p>}
        </form>
      )}
    </div>
  );
}
