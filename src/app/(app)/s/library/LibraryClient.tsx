"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { withBase } from "@/lib/base-path";
import { deleteLibraryItem, moveLibraryItem, renameLibraryItem } from "./actions";

export function UploadButton({ folder, accept }: { folder: string; accept: string }) {
  const { t } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErrors([]);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("file", f);
    fd.append("folder", folder);
    const res = await fetch(withBase("/api/library"), { method: "POST", body: fd }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { files?: { filename: string; error?: string }[] } | null;
    setErrors((j?.files ?? []).filter((f) => f.error).map((f) => t("lib.uploadFailed", { name: f.filename, reason: f.error! })));
    if (!res?.ok) setErrors([t("p2.err.generic")]);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => upload(e.target.files)} data-testid="library-upload" />
      <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy} title={t("lib.uploadHint")}>
        <Upload className="h-4 w-4" aria-hidden /> {busy ? t("lib.uploading") : t("lib.upload")}
      </button>
      {errors.map((e) => <p key={e} className="text-xs text-rose-700" role="alert">{e}</p>)}
    </div>
  );
}

export function LibraryRowMenu({ id, title, folder }: { id: string; title: string; folder: string }) {
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
          <button role="menuitem" className={item} onClick={() => { const v = window.prompt(t("p2.rename"), title); if (v) act(() => renameLibraryItem(id, v)); }}>{t("p2.rename")}</button>
          <button role="menuitem" className={item} onClick={() => { const v = window.prompt(t("lib.newFolder"), folder); if (v !== null) act(() => moveLibraryItem(id, v)); }}>{t("p2.move")}</button>
          <button role="menuitem" className={`${item} text-rose-700`} onClick={() => window.confirm(t("p2.confirmDelete", { title })) && act(() => deleteLibraryItem(id))}>{t("common.delete")}</button>
        </div>
      )}
    </div>
  );
}
