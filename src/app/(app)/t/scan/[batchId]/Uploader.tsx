"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { withBase } from "@/lib/base-path";

/** Sends files one by one (each photo / PDF is its own request) so large stacks show progress. */
export function Uploader({ batchId, disabled }: { batchId: string; disabled?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ i: number; n: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    setErrors([]);
    for (const [i, f] of list.entries()) {
      setBusy({ i: i + 1, n: list.length });
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch(withBase(`/api/scan/${batchId}/pages`), { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setErrors((e) => [...e, t("sc.uploadErr", { name: f.name, err: j.error ?? res.status })]);
        }
      } catch (e) {
        setErrors((x) => [...x, t("sc.uploadErr", { name: f.name, err: (e as Error).message })]);
      }
      router.refresh();
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-center"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}>
      <label className={`btn btn-primary ${disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
        <Upload className="h-4 w-4" /> {busy ? t("sc.uploading", busy) : t("sc.upload")}
        <input ref={input} type="file" multiple accept="image/*,application/pdf" className="sr-only" disabled={disabled || !!busy} onChange={(e) => upload(e.target.files)} data-testid="scan-file" />
      </label>
      <p className="mx-auto mt-2 max-w-xl text-xs text-slate-500">{t("sc.uploadHint")}</p>
      {errors.map((e) => <p key={e} className="mt-1 text-xs text-rose-700">{e}</p>)}
    </div>
  );
}
