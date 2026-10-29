"use client";
import { useState } from "react";

/** Single-series radar (0–100). One hue, no legend; hover/focus a vertex for its value; table fallback below. */
export function Radar({ data, label, tableLabel = "Table" }: { data: { label: string; value: number }[]; label: string; tableLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const S = 260;
  const c = S / 2;
  const R = 88;
  const n = data.length;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(ang) * R * (v / 100), c + Math.sin(ang) * R * (v / 100)] as const;
  };
  if (n < 3) return null;
  const poly = data.map((d, i) => pt(i, d.value).join(",")).join(" ");
  return (
    <figure>
      <svg viewBox={`-70 -6 ${S + 140} ${S + 12}`} className="mx-auto w-full max-w-sm" role="img" aria-label={label}>
        {[25, 50, 75, 100].map((r) => (
          <polygon key={r} points={data.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="#e2e8f0" strokeWidth={1} />
        ))}
        {data.map((_, i) => {
          const [x, y] = pt(i, 100);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />;
        })}
        <polygon points={poly} fill="#6366f1" fillOpacity={0.18} stroke="#4f46e5" strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => {
          const [x, y] = pt(i, d.value);
          const [lx, ly] = pt(i, 122);
          return (
            <g key={d.label}>
              <circle cx={x} cy={y} r={hover === i ? 6 : 4} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
              <circle
                cx={x} cy={y} r={12} fill="transparent" tabIndex={0}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                aria-label={`${d.label}: ${d.value}`}
              />
              <text x={lx} y={ly} textAnchor={Math.abs(lx - c) < 4 ? "middle" : lx > c ? "start" : "end"} dominantBaseline="middle" className="fill-slate-600 text-[10px]">
                {d.label}
              </text>
              {hover === i && (
                <g pointerEvents="none">
                  <rect x={x - 18} y={y - 26} width={36} height={18} rx={4} fill="#0f172a" />
                  <text x={x} y={y - 17} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[11px] font-medium">{d.value}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">{tableLabel}</summary>
        <table className="table-base mt-1">
          <tbody>
            {data.map((d) => (
              <tr key={d.label}><td>{d.label}</td><td className="text-right tabular-nums">{d.value}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
