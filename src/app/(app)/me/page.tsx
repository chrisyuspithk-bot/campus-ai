import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { modelsFor } from "@/lib/models";
import { Page, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { AVATARS } from "@/lib/avatars";
import { logoutAllDevices, saveProfile } from "./actions";
import { PasswordForm } from "./PasswordForm";
import { withBase } from "@/lib/base-path";

export const metadata: Metadata = { title: "個人設定" };

export default async function MePage() {
  const user = await requireUser();
  const { t } = await getT();
  const models = modelsFor(user.role);

  return (
    <Page>
      <div className="mx-auto max-w-xl">
        <PageHeader title={t("me.title")} />
        <form action={saveProfile} className="card space-y-5 p-6">
          <fieldset>
            <legend className="label">{t("me.avatar")}</legend>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <label key={a} className="cursor-pointer">
                  <input type="radio" name="avatar" value={a} defaultChecked={user.avatar === a} className="peer sr-only" />
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-xl peer-checked:border-brand-500 peer-checked:ring-2 peer-checked:ring-brand-200 peer-focus-visible:ring-2">{a}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="displayName" className="label">{t("me.displayName")}</label>
            <input id="displayName" name="displayName" defaultValue={user.displayName} required maxLength={40} className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">{t("me.email")}</label>
            <input id="email" value={user.email ?? ""} readOnly disabled className="input" />
          </div>
          <fieldset>
            <legend className="label">{t("me.language")}</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="language" value="zh-Hant" defaultChecked={user.language === "zh-Hant"} /> 繁中</label>
              <label className="flex items-center gap-2"><input type="radio" name="language" value="en" defaultChecked={user.language === "en"} /> English</label>
            </div>
          </fieldset>
          <div>
            <label htmlFor="defaultModelId" className="label">{t("me.defaultModel")}</label>
            <select id="defaultModelId" name="defaultModelId" defaultValue={user.defaultModelId ?? ""} className="input">
              <option value="">—</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-400" aria-disabled>
            <Bell className="mt-0.5 h-4 w-4" aria-hidden />
            <div>
              <div className="font-medium">{t("me.notifications")} <span className="phase-badge">P3</span></div>
              <div>{t("me.notificationsDesc")}</div>
            </div>
          </div>
          <div className="flex justify-end"><SubmitButton>{t("common.save")}</SubmitButton></div>
        </form>

        <div className="card mt-6 space-y-4 p-6">
          <PasswordForm />
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <form action={logoutAllDevices}><button className="btn">{t("me.logoutAll")}</button></form>
            <form action={withBase("/api/auth/logout")} method="post"><button className="btn btn-danger">{t("me.logout")}</button></form>
          </div>
        </div>
      </div>
    </Page>
  );
}
