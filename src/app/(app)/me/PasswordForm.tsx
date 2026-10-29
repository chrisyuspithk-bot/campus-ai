"use client";
import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { changePassword, type PwState } from "./actions";

export function PasswordForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState<PwState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      <h2 className="section-title">{t("me.changePassword")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="old" type="password" autoComplete="current-password" placeholder={t("me.oldPassword")} aria-label={t("me.oldPassword")} required className="input" />
        <input name="new" type="password" autoComplete="new-password" placeholder={t("me.newPassword")} aria-label={t("me.newPassword")} required minLength={8} className="input" />
      </div>
      <button className="btn" disabled={pending}>{t("me.changePassword")}</button>
      {state.error && <p className="text-sm text-rose-600">{t(state.error)}</p>}
      {state.ok && <p className="text-sm text-teal-700">✓ {t("me.passwordChanged")}</p>}
    </form>
  );
}
