"use client";
import { Printer } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function PrintButton() {
  const { t } = useT();
  return (
    <button className="btn btn-sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {t("pp.printPaper")}
    </button>
  );
}
