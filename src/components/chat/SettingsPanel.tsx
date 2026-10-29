"use client";
import { Lock } from "lucide-react";
import type { ChatTools } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/format";
import type { DictKey } from "@/lib/i18n/dict";

export function SettingsPanel(props: {
  tutor: { name: string; subject: string; strategy: string } | null;
  models: { id: string; displayName: string; description: string }[];
  modelId: string;
  modelLocked: boolean;
  onModel: (id: string) => void;
  tools: ChatTools;
  features: { search: boolean; image: boolean; tts: boolean };
  onTools: (t: ChatTools) => void;
  onUpload: () => void;
  quota: { percent: number; usedToday: number; dailyTokens: number; imagesToday: number; imagesPerDay: number; exhausted: boolean };
}) {
  const { t } = useT();
  const toolRows: { key: keyof ChatTools; label: DictKey; available: boolean; hint?: string }[] = [
    { key: "rag", label: "chat.toolRag", available: Boolean(props.tutor) },
    { key: "search", label: "chat.toolSearch", available: props.features.search, hint: t("chat.toolOffByAdmin") },
    {
      key: "image",
      label: "chat.toolImage",
      available: props.features.image && props.quota.imagesToday < props.quota.imagesPerDay,
      hint: props.features.image ? `${props.quota.imagesToday}/${props.quota.imagesPerDay}` : t("chat.toolOffByAdmin"),
    },
    { key: "tts", label: "chat.toolTts", available: props.features.tts, hint: t("chat.toolOffByAdmin") },
  ];
  const pct = props.quota.percent;
  const bar = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500";

  return (
    <div className="space-y-6 p-4 text-sm" data-testid="chat-settings">
      <h2 className="section-title">{t("chat.settings")}</h2>

      <div>
        <div className="label">{t("chat.mode")}</div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-center text-sm" role="radiogroup" aria-label={t("chat.mode")}>
          <span role="radio" aria-checked={!props.tutor} className={`flex-1 rounded-md py-1 ${!props.tutor ? "bg-white font-medium shadow-sm" : "text-slate-400"}`}>{t("chat.modeFree")}</span>
          <span role="radio" aria-checked={!!props.tutor} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 ${props.tutor ? "bg-white font-medium shadow-sm" : "text-slate-400"}`}>
            {props.tutor && <Lock className="h-3 w-3" />} {t("chat.modeTutor")}
          </span>
        </div>
        {props.tutor && (
          <p className="mt-2 text-xs text-slate-500">
            {props.tutor.name} · {t(`tutors.strategy.${props.tutor.strategy}` as DictKey)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="model" className="label">{t("chat.model")}</label>
        <select id="model" className="input" value={props.modelId} onChange={(e) => props.onModel(e.target.value)} disabled={props.models.length <= 1}>
          {props.models.map((m) => (
            <option key={m.id} value={m.id}>{m.displayName}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {props.models.find((m) => m.id === props.modelId)?.description}
          {props.modelLocked && <> · {t("chat.modelLocked")}</>}
        </p>
        {props.models.length > 1 && <p className="mt-1 text-xs text-slate-400" data-testid="model-hint">💡 {t("p7.model.hint")}</p>}
      </div>

      <fieldset>
        <legend className="label">{t("chat.tools")}</legend>
        <div className="space-y-2">
          {toolRows.map((row) => (
            <label key={row.key} className={`flex items-center gap-2 ${row.available ? "" : "text-slate-400"}`}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={row.available && props.tools[row.key]}
                disabled={!row.available}
                onChange={(e) => props.onTools({ ...props.tools, [row.key]: e.target.checked })}
              />
              <span className="flex-1">{t(row.label)}</span>
              {row.hint && (!row.available || row.key === "image") && <span className="text-xs text-slate-400">{row.hint}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="label">{t("chat.files")}</div>
        <button className="btn btn-sm" onClick={props.onUpload}>{t("chat.upload")}</button>
        <p className="mt-1 text-xs text-slate-500">{t("chat.uploadHint")}</p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">{t("chat.quota")}</span>
          <span className={`text-xs font-semibold ${pct >= 100 ? "text-rose-600" : "text-slate-600"}`} data-testid="quota-pct">{t("chat.quotaToday", { pct })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t("chat.quotaDetail", {
            used: formatNumber(props.quota.usedToday),
            limit: formatNumber(props.quota.dailyTokens),
            img: props.quota.imagesToday,
            imgLimit: props.quota.imagesPerDay,
          })}
        </p>
        {props.quota.exhausted && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{t("chat.quotaExhausted")}</p>}
      </div>
    </div>
  );
}
