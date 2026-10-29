"use client";
import { Printer } from "lucide-react";

export function PrintPdf({ label }: { label: string }) {
  return (
    <button className="btn" onClick={() => window.print()} data-testid="report-print">
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
