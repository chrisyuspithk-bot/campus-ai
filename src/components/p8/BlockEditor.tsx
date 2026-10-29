"use client";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { ACTION_TYPES, compileBlocks, MAX_ACTIONS, MAX_RULES, type BlockAction, type BlockRule } from "@/lib/p8/files";

const DEFAULTS: Record<BlockAction["type"], BlockAction> = {
  setText: { type: "setText", target: "", text: "" },
  count: { type: "count", target: "", by: 1 },
  toggle: { type: "toggle", target: "" },
  random: { type: "random", target: "", options: "A,B,C" },
  color: { type: "color", target: "", color: "#16a34a" },
  save: { type: "save", from: "", key: "list", target: "" },
};

/** P8 (V3) 簡易邏輯編排: WHEN (click / load) → DO a short list of actions. Compiles to blocks.js. */
export function BlockEditor({ blocks, onChange, html }: { blocks: BlockRule[]; onChange: (b: BlockRule[]) => void; html: string }) {
  const { t } = useT();
  const ids = [...new Set([...html.matchAll(/\bid\s*=\s*["']?([A-Za-z0-9_-]+)/g)].map((m) => m[1]))];
  const has = (id: string) => !id || ids.includes(id);
  const setRule = (i: number, patch: Partial<BlockRule>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const setAction = (i: number, k: number, a: BlockAction) => setRule(i, { actions: blocks[i].actions.map((x, j) => (j === k ? a : x)) });
  const field = (value: string, onValue: (v: string) => void, ph: string, list = false, w = "w-28") => (
    <input className={`input ${w} py-0.5 text-xs ${list && value && !has(value) ? "border-amber-400" : ""}`} value={value} onChange={(e) => onValue(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))} placeholder={ph} list={list ? "p8-ids" : undefined} aria-label={ph} />
  );
  const text = (value: string, onValue: (v: string) => void, ph: string) => (
    <input className="input w-40 py-0.5 text-xs" value={value} onChange={(e) => onValue(e.target.value)} placeholder={ph} aria-label={ph} />
  );

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-slate-50 p-3 text-sm" data-testid="block-editor">
      <datalist id="p8-ids">{ids.map((id) => <option key={id} value={id} />)}</datalist>
      <div className="flex items-start gap-2">
        <div>
          <p className="font-semibold text-slate-800">🧩 {t("p8.blocks.title")}</p>
          <p className="text-xs text-slate-500">{t("p8.blocks.note")}</p>
        </div>
        <button type="button" className="btn btn-sm ml-auto shrink-0" disabled={blocks.length >= MAX_RULES} onClick={() => onChange([...blocks, { on: "click", source: ids.find((x) => /btn|go|b$|button/i.test(x)) ?? ids[0] ?? "", actions: [{ ...DEFAULTS.setText }] }])} data-testid="block-add">{t("p8.blocks.add")}</button>
      </div>
      {blocks.length === 0 && <p className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500">{t("p8.blocks.empty")}</p>}
      {blocks.map((b, i) => (
        <div key={i} className="rounded-lg border border-violet-200 bg-white p-2" data-testid="block-rule">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="badge bg-violet-100 text-violet-800">{t("p8.blocks.when")}</span>
            <select className="input w-auto py-0.5 text-xs" value={b.on} onChange={(e) => setRule(i, { on: e.target.value as BlockRule["on"] })} aria-label={t("p8.blocks.when")}>
              <option value="click">{t("p8.blocks.on.click")}</option>
              <option value="load">{t("p8.blocks.on.load")}</option>
            </select>
            {b.on === "click" && <>#{field(b.source, (v) => setRule(i, { source: v }), t("p8.blocks.source"), true)}</>}
            {b.on === "click" && !has(b.source) && <span className="text-amber-700">{t("p8.blocks.noTarget")}</span>}
            <button type="button" className="btn btn-sm btn-ghost ml-auto text-rose-700" onClick={() => onChange(blocks.filter((_, j) => j !== i))} aria-label={t("p8.blocks.remove")}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-1.5 space-y-1 border-l-2 border-violet-200 pl-3">
            {b.actions.map((a, k) => (
              <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="block-action">
                <span className="text-violet-700">{t("p8.blocks.do")}</span>
                <select className="input w-auto py-0.5 text-xs" value={a.type} onChange={(e) => setAction(i, k, { ...DEFAULTS[e.target.value as BlockAction["type"]], target: a.target } as BlockAction)} aria-label={t("p8.blocks.do")}>
                  {ACTION_TYPES.map((x) => <option key={x} value={x}>{t(`p8.blocks.a.${x}`)}</option>)}
                </select>
                {a.type === "save" && <>#{field(a.from, (v) => setAction(i, k, { ...a, from: v }), t("p8.blocks.from"), true)}{text(a.key, (v) => setAction(i, k, { ...a, key: v }), t("p8.blocks.key"))}→</>}
                #{field(a.target, (v) => setAction(i, k, { ...a, target: v } as BlockAction), t("p8.blocks.target"), true)}
                {a.type === "setText" && text(a.text, (v) => setAction(i, k, { ...a, text: v }), t("p8.blocks.text"))}
                {a.type === "count" && <input type="number" className="input w-16 py-0.5 text-xs" value={a.by} onChange={(e) => setAction(i, k, { ...a, by: Math.trunc(Number(e.target.value)) || 1 })} aria-label={t("p8.blocks.by")} />}
                {a.type === "random" && text(a.options, (v) => setAction(i, k, { ...a, options: v }), t("p8.blocks.options"))}
                {a.type === "color" && <input type="color" className="h-6 w-10" value={/^#[0-9a-f]{6}$/i.test(a.color) ? a.color : "#16a34a"} onChange={(e) => setAction(i, k, { ...a, color: e.target.value })} aria-label="color" />}
                <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => setRule(i, { actions: b.actions.filter((_, j) => j !== k) })} aria-label={t("p8.blocks.remove")}>✕</button>
              </div>
            ))}
            {b.actions.length < MAX_ACTIONS && <button type="button" className="text-xs text-violet-700 hover:underline" onClick={() => setRule(i, { actions: [...b.actions, { ...DEFAULTS.setText }] })}>{t("p8.blocks.addAction")}</button>}
          </div>
        </div>
      ))}
      {blocks.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500">{t("p8.blocks.js")}</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-900 p-2 text-slate-100" data-testid="blocks-js">{compileBlocks(blocks)}</pre>
        </details>
      )}
    </div>
  );
}
