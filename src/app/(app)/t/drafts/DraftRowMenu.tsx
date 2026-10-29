"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { deleteDraft, duplicateDraft, renameDraft, setDraftArchived } from "./actions";
import { withBase } from "@/lib/base-path";

export function DraftRowMenu({ id, title, archived }: { id: string; title: string; archived: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const act = (fn: () => Promise<unknown>) => {
    setOpen(false);
    start(async () => {
      await fn();
    });
  };
  const item = "block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50";

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button className="btn btn-sm" onClick={() => setOpen((v) => !v)} disabled={pending} aria-haspopup="menu" aria-label={t("common.actions")}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button role="menuitem" className={item} onClick={() => { const v = window.prompt(t("drafts.rename"), title); if (v) act(() => renameDraft(id, v)); }}>{t("drafts.rename")}</button>
          <button role="menuitem" className={item} onClick={() => act(() => duplicateDraft(id))}>{t("drafts.duplicate")}</button>
          <button role="menuitem" className={item} onClick={() => act(() => setDraftArchived(id, !archived))}>{archived ? t("drafts.unarchive") : t("drafts.archive")}</button>
          <a role="menuitem" className={item} href={withBase(`/api/drafts/${id}/export`)} onClick={() => setOpen(false)}>{t("drafts.exportMd")}</a>
          <button role="menuitem" className={`${item} text-rose-700`} onClick={() => window.confirm(t("drafts.deleteConfirm")) && act(() => deleteDraft(id))}>{t("common.delete")}</button>
        </div>
      )}
    </div>
  );
}
