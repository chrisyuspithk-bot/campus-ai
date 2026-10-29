"use client";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/p2-client";
import { Markdown } from "@/components/Markdown";

export function WorksheetView({ id, initial, saveAsDraft }: { id: string; initial: string; saveAsDraft: (markdown: string) => Promise<void> }) {
  const { t } = useT();
  const [md, setMd] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  async function save() {
    await api(`/api/studio/${id}`, { markdown: md }, "PATCH");
    setDirty(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn btn-sm ${!editing ? "btn-primary" : ""}`} onClick={() => setEditing(false)}>{t("st.ws.preview")}</button>
        <button className={`btn btn-sm ${editing ? "btn-primary" : ""}`} onClick={() => setEditing(true)}>{t("st.ws.edit")}</button>
        {dirty && <button className="btn btn-sm" onClick={save}>{t("common.save")}</button>}
        <span className="ml-auto" />
        <button className="btn btn-sm" disabled title={t("common.unlockAt", { phase: "P3" })}>{t("st.ws.toBank")}</button>
        <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => start(() => saveAsDraft(md))} data-testid="ws-to-draft">{t("st.ws.toDraft")}</button>
      </div>
      {editing ? (
        <textarea className="input min-h-[32rem] font-mono text-sm" value={md} onChange={(e) => { setMd(e.target.value); setDirty(true); }} onBlur={() => dirty && save()} />
      ) : (
        <article className="card prose max-w-none p-6"><Markdown>{md}</Markdown></article>
      )}
    </div>
  );
}
