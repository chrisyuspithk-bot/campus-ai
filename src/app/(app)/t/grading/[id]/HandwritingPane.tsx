"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eraser, PenLine, Stamp, Trash2, Type, Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { InkItem } from "@/lib/db/schema";
import { INK_COLORS, STAMPS } from "@/lib/p5/ink";
import { InkItems } from "@/components/p5/InkLayer";

export type HwPage = { id: string; url: string; width: number; height: number; pageNo: number };
type Tool = "pen" | "text" | "stamp" | "erase";

/** Scanned page canvas with a colour pen / text / stamp layer. Coordinates are in a 1000-wide page box. */
export function HandwritingPane({ pages, ink, onChange, dirty }: { pages: HwPage[]; ink: Record<string, InkItem[]>; onChange: (pageId: string, items: InkItem[]) => void; dirty: boolean }) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(INK_COLORS[0]);
  const [stamp, setStamp] = useState(STAMPS[0]);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const page = pages[idx];
  const items = ink[page.id] ?? [];
  const h = Math.round((1000 * (page.height || 1414)) / (page.width || 1000));

  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * h)];
  };
  const add = (it: InkItem) => onChange(page.id, [...items, it]);

  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "erase") return;
    const [x, y] = pt(e);
    if (tool === "pen") {
      svg.current!.setPointerCapture(e.pointerId);
      setDraft([x, y]);
    } else if (tool === "stamp") {
      add({ t: "stamp", c: color, x, y, s: stamp });
    } else {
      e.preventDefault(); // keep focus on the text box that opens here
      setTextAt({ x, y });
      setText("");
    }
  }
  function move(e: React.PointerEvent) {
    if (!draft) return;
    const [x, y] = pt(e);
    const lx = draft[draft.length - 2];
    const ly = draft[draft.length - 1];
    if (Math.abs(x - lx) + Math.abs(y - ly) >= 3) setDraft([...draft, x, y]);
  }
  function up() {
    if (draft && draft.length >= 4) add({ t: "pen", c: color, w: 4, p: draft });
    else if (draft) add({ t: "pen", c: color, w: 4, p: [...draft, draft[0] + 1, draft[1] + 1] });
    setDraft(null);
  }
  function commitText() {
    if (textAt && text.trim()) add({ t: "text", c: color, x: textAt.x, y: textAt.y, s: text.trim() });
    setTextAt(null);
    setText("");
  }

  const toolBtn = (k: Tool, Icon: typeof PenLine, label: string) => (
    <button type="button" className={`btn btn-sm ${tool === k ? "btn-primary" : ""}`} aria-pressed={tool === k} onClick={() => setTool(k)} data-testid={`hw-tool-${k}`}><Icon className="h-4 w-4" />{label}</button>
  );

  return (
    <section className="card p-3" data-testid="hw-pane">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {toolBtn("pen", PenLine, t("hw.pen"))}
        {toolBtn("text", Type, t("hw.text"))}
        {toolBtn("stamp", Stamp, t("hw.stamp"))}
        {toolBtn("erase", Eraser, t("hw.erase"))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {INK_COLORS.map((c) => (
          <button key={c} type="button" className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-slate-900" : "border-white"} shadow`} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} />
        ))}
        {tool === "stamp" && (
          <span className="ml-1 flex gap-1">
            {STAMPS.map((s) => <button key={s} type="button" className={`h-7 w-7 rounded border text-sm font-bold ${stamp === s ? "border-brand-500 bg-brand-50" : "border-slate-200"}`} style={{ color }} onClick={() => setStamp(s)} aria-pressed={stamp === s}>{s}</button>)}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(page.id, items.slice(0, -1))} disabled={!items.length} title={t("hw.undo")}><Undo2 className="h-4 w-4" /></button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(page.id, [])} disabled={!items.length} title={t("hw.clear")}><Trash2 className="h-4 w-4" /></button>
        </span>
      </div>

      <div className="relative mx-auto max-w-3xl overflow-hidden rounded border border-slate-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.url} alt={t("hw.pageN", { n: idx + 1, m: pages.length })} className="block w-full select-none" draggable={false} />
        <svg ref={svg} viewBox={`0 0 1000 ${h}`} className="absolute inset-0 h-full w-full" style={{ touchAction: "none", cursor: tool === "erase" ? "not-allowed" : "crosshair" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="hw-canvas">
          <InkItems items={items} onPick={tool === "erase" ? (i) => onChange(page.id, items.filter((_, k) => k !== i)) : undefined} />
          {draft && <path d={draft.reduce((d, v, i) => d + (i % 2 ? ` ${v}` : `${i ? "L" : "M"}${v}`), "")} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" />}
        </svg>
        {textAt && (
          <input autoFocus className="input absolute w-56 py-1 text-sm shadow-lg" style={{ left: `${(textAt.x / 1000) * 100}%`, top: `${(textAt.y / h) * 100}%`, color }}
            value={text} placeholder={t("hw.textPh")} onChange={(e) => setText(e.target.value)} data-testid="hw-text-input"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") setTextAt(null); }} onBlur={commitText} />
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm">
        <button type="button" className="btn btn-sm" disabled={idx === 0} onClick={() => setIdx(idx - 1)} data-testid="hw-prev"><ChevronLeft className="h-4 w-4" />{t("hw.prev")}</button>
        <span className="tabular-nums text-slate-600" data-testid="hw-page">{t("hw.pageN", { n: idx + 1, m: pages.length })}</span>
        <button type="button" className="btn btn-sm" disabled={idx >= pages.length - 1} onClick={() => setIdx(idx + 1)} data-testid="hw-next">{t("hw.next")}<ChevronRight className="h-4 w-4" /></button>
        <span className="ml-2 flex gap-1">
          {pages.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setIdx(i)} className={`h-12 w-9 overflow-hidden rounded border ${i === idx ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200"}`} aria-label={t("hw.pageN", { n: i + 1, m: pages.length })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover object-top" />
            </button>
          ))}
        </span>
        <span className="ml-auto text-xs text-slate-500" data-testid="hw-count">{t("hw.items", { n: Object.values(ink).reduce((s, l) => s + l.length, 0) })}{dirty && <b className="ml-2 text-amber-700">· {t("hw.unsaved")}</b>}</span>
      </div>
    </section>
  );
}
