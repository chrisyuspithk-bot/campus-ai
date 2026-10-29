"use client";
import Link from "next/link";
import { MessageSquareOff } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function ChatDisabled() {
  const { t } = useT();
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <MessageSquareOff className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden />
        <p className="mb-4 text-slate-700">{t("chat.disabled")}</p>
        <Link href="/" className="btn btn-primary">{t("common.backHome")}</Link>
      </div>
    </div>
  );
}
