"use client";
import { useState } from "react";
import { Shield } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { sandboxDoc } from "@/lib/p6/sandbox";

/** Reviewer view of a submitted app: run it in the sandbox or read the code. */
export function AppReviewPreview({ html, title, flags }: { html: string; title: string; flags: string[] }) {
  const { t } = useT();
  const [view, setView] = useState<"run" | "code">("run");
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 p-1.5 text-xs">
        <button type="button" className={`btn btn-sm ${view === "run" ? "btn-primary" : ""}`} onClick={() => setView("run")}>{t("p6.mod.run")}</button>
        <button type="button" className={`btn btn-sm ${view === "code" ? "btn-primary" : ""}`} onClick={() => setView("code")}>{t("cr.code")}</button>
        <span className="ml-2 flex items-center gap-1 text-slate-500"><Shield className="h-3.5 w-3.5 text-emerald-600" /> {t("p6.ap.previewSandbox")}</span>
        {flags.length > 0 ? flags.map((f) => <span key={f} className="badge bg-amber-50 text-amber-800">⚠ {f}</span>) : <span className="badge bg-emerald-50 text-emerald-700">{t("p6.mod.noFlags")}</span>}
      </div>
      {view === "run" ? (
        <iframe sandbox="allow-scripts" srcDoc={sandboxDoc(html)} title={title} className="h-72 w-full bg-white" />
      ) : (
        <pre className="h-72 overflow-auto bg-slate-900 p-3 text-xs text-slate-100">{html}</pre>
      )}
    </div>
  );
}
