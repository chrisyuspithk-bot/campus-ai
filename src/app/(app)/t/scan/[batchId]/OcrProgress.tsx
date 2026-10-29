"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { tickOcrAction } from "../actions";

/** Polls the OCR queue; refreshes the page once every matched page is processed. */
export function OcrProgress({ batchId, done: d0, total }: { batchId: string; done: number; total: number }) {
  const { t } = useT();
  const router = useRouter();
  const [p, setP] = useState({ done: d0, total });
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 700));
        try {
          const r = await tickOcrAction(batchId);
          setP({ done: r.done, total: r.total });
          if (r.status !== "ocr") {
            router.refresh();
            return;
          }
        } catch {
          return;
        }
      }
    };
    loop();
    return () => { stop = true; };
  }, [batchId, router]);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 100;
  return (
    <div className="card p-4" data-testid="ocr-progress">
      <div className="mb-2 flex justify-between text-sm"><span>{t("sc.ocrRunning", { d: p.done, n: p.total })}</span><span className="tabular-nums">{pct}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
