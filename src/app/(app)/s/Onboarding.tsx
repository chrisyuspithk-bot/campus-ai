"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

const KEY = "campus.onboarded";

/** First-login guide: "揀一科開始". Dismissal is remembered on this device. */
export function Onboarding({ show }: { show: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (show && !localStorage.getItem(KEY)) setOpen(true);
  }, [show]);
  if (!open) return null;
  const close = () => {
    localStorage.setItem(KEY, "1");
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="card max-w-sm p-6 text-center">
        <div className="mb-2 text-4xl" aria-hidden>👋</div>
        <h2 id="onboard-title" className="text-lg font-semibold">{t("s.onboardTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("s.onboardBody")}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn" onClick={close}>{t("common.close")}</button>
          <Link href="/s/tutors" className="btn btn-primary" onClick={close}>{t("s.onboardCta")}</Link>
        </div>
      </div>
    </div>
  );
}
