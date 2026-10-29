import type { ScanBatchStatus } from "@/lib/db/schema";
import type { DictKey } from "@/lib/i18n/dict";

const STYLE: Record<ScanBatchStatus, string> = {
  uploading: "bg-sky-50 text-sky-800",
  matching: "bg-amber-50 text-amber-800",
  ocr: "bg-violet-50 text-violet-800",
  ready: "bg-emerald-50 text-emerald-700",
};

/** 上載中／對名 m/n／OCR／待批 */
export function StatusChip({ status, matched, pages, t }: { status: ScanBatchStatus; matched: number; pages: number; t: (k: DictKey, v?: Record<string, string | number>) => string }) {
  return (
    <span className={`badge ${STYLE[status]}`} data-testid="scan-status">
      {status === "matching" ? t("sc.st.matching", { m: matched, n: pages }) : t(`sc.st.${status}`)}
    </span>
  );
}
