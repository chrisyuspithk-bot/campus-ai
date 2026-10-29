"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Layers, ListChecks, Minus, Plus, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/p2-client";
import { downloadBlob, safeName, svgToPng } from "@/lib/export-client";
import type { DictKey } from "@/lib/i18n/dict";
import type { MindNode, Mindmap } from "@/lib/studio/types";

const COL = 230;
const ROW = 52;
const H = 34;
const PAD = 24;
const COLORS = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#db2777", "#059669", "#dc2626", "#4f46e5"];

type Pos = Record<string, { x: number; y: number }>;
type Laid = { node: MindNode; depth: number; parent?: string; color: string; w: number };

const widthOf = (label: string) => Math.min(200, Math.max(64, [...label].reduce((w, c) => w + (/[㐀-鿿]/.test(c) ? 15 : 8), 24)));

/** Left-to-right tree: x by depth, y by leaf order (parents centred on their children). */
function layout(root: MindNode) {
  const laid: Laid[] = [];
  const auto: Pos = {};
  let leaf = 0;
  const visit = (n: MindNode, depth: number, parent: string | undefined, color: string): number => {
    laid.push({ node: n, depth, parent, color, w: widthOf(n.label) });
    let y: number;
    if (!n.children.length) y = leaf++ * ROW;
    else {
      const ys = n.children.map((c, i) => visit(c, depth + 1, n.id, depth === 0 ? COLORS[i % COLORS.length] : color));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    auto[n.id] = { x: depth * COL, y };
    return y;
  };
  visit(root, 0, undefined, "#0f172a");
  return { laid, auto };
}

export function MindmapView({ id, initial }: { id: string; initial: Mindmap }) {
  const { t } = useT();
  const router = useRouter();
  const [map, setMap] = useState(initial);
  const [pos, setPos] = useState<Pos>(initial.positions ?? {});
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<DictKey | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const { laid, auto } = useMemo(() => layout(map.root), [map]);
  const at = (nid: string) => pos[nid] ?? auto[nid];
  const xs = laid.map((l) => at(l.node.id).x);
  const ys = laid.map((l) => at(l.node.id).y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD - H / 2;
  const width = Math.max(...laid.map((l) => at(l.node.id).x + l.w)) - minX + PAD;
  const height = Math.max(...ys) - minY + PAD + H / 2;
  const byId = Object.fromEntries(laid.map((l) => [l.node.id, l]));
  const sel = selected ? byId[selected]?.node : null;

  function onDown(e: React.PointerEvent, nid: string) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = at(nid);
    drag.current = { id: nid, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setPos((p) => ({ ...p, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return setSelected((s) => (s === d.id ? null : d.id));
    void api(`/api/studio/${id}`, { positions: pos }, "PATCH"); // handler is re-created each render, so `pos` is current
  }

  function reset() {
    setPos({});
    setZoom(1);
    void api(`/api/studio/${id}`, { positions: {} }, "PATCH");
  }

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${map.root.label}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      downloadBlob(await svgToPng(svg, width, height), `${safeName(map.root.label)}.png`);
    } catch {
      setError("p2.err.generic");
    }
  }

  async function convert(to: "flashcards" | "quiz") {
    setBusy(true);
    setError(null);
    const r = await api<{ href: string }>(`/api/studio/${id}/convert`, { to });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    router.push(r.data.href);
  }

  async function expand(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await api<{ mindmap: Mindmap; added: string[] }>(`/api/studio/${id}/expand`, { instruction });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMap(r.data.mindmap);
    setInstruction("");
    setMsg(t("st.mm.added", { labels: r.data.added.join("、") }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="card flex min-h-[28rem] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 p-2">
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(2, z + 0.2))} aria-label={t("st.mm.zoomIn")} title={t("st.mm.zoomIn")}><Plus className="h-4 w-4" /></button>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))} aria-label={t("st.mm.zoomOut")} title={t("st.mm.zoomOut")}><Minus className="h-4 w-4" /></button>
          <button className="btn btn-sm" onClick={reset} title={t("st.mm.reset")}><RotateCcw className="h-4 w-4" /> {t("st.mm.reset")}</button>
          <button className="btn btn-sm" onClick={exportSvg}><Download className="h-4 w-4" /> {t("st.mm.export")}</button>
          <button className="btn btn-sm" onClick={exportPng} data-testid="mm-export-png"><Download className="h-4 w-4" /> {t("st.mm.exportPng")}</button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button className="btn btn-sm" onClick={() => convert("flashcards")} disabled={busy} data-testid="mm-to-cards"><Layers className="h-4 w-4" /> {t("st.mm.toCards")}</button>
          <button className="btn btn-sm" onClick={() => convert("quiz")} disabled={busy}><ListChecks className="h-4 w-4" /> {t("st.mm.toQuiz")}</button>
          <span className="ml-auto text-xs text-slate-500">{t("st.mm.dragHint")}</span>
        </div>
        <div className="flex-1 overflow-auto bg-slate-50">
          <svg
            ref={svgRef}
            width={width * zoom}
            height={height * zoom}
            viewBox={`${minX} ${minY} ${width} ${height}`}
            className="touch-none select-none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            data-testid="mindmap"
          >
            {laid.map((l) => {
              if (!l.parent) return null;
              const a = at(l.parent);
              const b = at(l.node.id);
              const ax = a.x + byId[l.parent].w;
              const mx = (ax + b.x) / 2;
              return <path key={`e-${l.node.id}`} d={`M${ax},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`} fill="none" stroke={l.color} strokeOpacity={0.5} strokeWidth={2} />;
            })}
            {laid.map((l) => {
              const p = at(l.node.id);
              const root = l.depth === 0;
              return (
                <g key={l.node.id} transform={`translate(${p.x},${p.y - H / 2})`} onPointerDown={(e) => onDown(e, l.node.id)} className="cursor-grab">
                  <rect
                    width={l.w}
                    height={H}
                    rx={root ? 17 : 8}
                    fill={root ? "#0f172a" : "#ffffff"}
                    stroke={selected === l.node.id ? "#f59e0b" : l.color}
                    strokeWidth={selected === l.node.id ? 3 : l.depth === 1 ? 2 : 1}
                  />
                  <text x={l.w / 2} y={H / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={l.depth <= 1 ? 600 : 400} fill={root ? "#ffffff" : "#0f172a"}>
                    {l.node.label.length > 16 ? `${l.node.label.slice(0, 15)}…` : l.node.label}
                  </text>
                  {l.node.note && !root && <circle cx={l.w - 6} cy={6} r={3} fill={l.color} />}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <aside className="space-y-4">
        {sel && (
          <div className="card p-4" data-testid="mm-note">
            <h3 className="font-semibold">{sel.label}</h3>
            {sel.note && <p className="mt-1 text-sm text-slate-600">{sel.note}</p>}
          </div>
        )}
        <form onSubmit={expand} className="card space-y-2 p-4">
          <h3 className="font-semibold">✨ {t("st.mm.ai")}</h3>
          <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={t("st.mm.aiPh")} data-testid="mm-ai" />
          <button className="btn btn-primary w-full" disabled={busy || !instruction.trim()}>{busy ? t("p2.working") : t("st.mm.aiSend")}</button>
          {msg && <p className="text-sm text-teal-700">{msg}</p>}
        </form>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{t(error)}</p>}
      </aside>
    </div>
  );
}
