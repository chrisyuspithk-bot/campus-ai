"use client";
import { useState } from "react";
import { formatNumber } from "@/lib/format";

/** Single-series daily token bars. One hue (no legend), rounded data-ends, hover tooltip, table fallback. */
export function UsageBars({ data, label }: { data: { day: string; tokens: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.tokens));
  const peak = data.reduce((best, d, i) => (d.tokens > data[best].tokens ? i : best), 0);
  const H = 160;

  return (
    <figure>
      <div className="relative" style={{ height: H + 24 }} role="img" aria-label={label}>
        {/* recessive gridline at the max */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <div className="absolute inset-x-0 bottom-6 border-t border-slate-300" />
        <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px] px-1">
          {data.map((d, i) => {
            const h = Math.max(2, (d.tokens / max) * H);
            return (
              <div
                key={d.day}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.day}: ${d.tokens.toLocaleString()} tokens`}
              >
                <div
                  className={`w-full max-w-10 rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? "opacity-50" : ""}`}
                  style={{ height: h, backgroundColor: "#6366f1" }}
                />
                {(i === peak || hover === i) && (
                  <span className={`pointer-events-none absolute text-[11px] font-medium tabular-nums ${hover === i ? "rounded bg-slate-900 px-1.5 py-0.5 text-white shadow" : "text-slate-600"}`} style={{ bottom: h + 4 }}>
                    {hover === i ? `${d.day.slice(5)} · ${d.tokens.toLocaleString()}` : formatNumber(d.tokens)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex gap-[2px] px-1">
          {data.map((d) => (
            <span key={d.day} className="flex-1 text-center text-[11px] text-slate-500 tabular-nums">{d.day.slice(5)}</span>
          ))}
        </div>
      </div>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer">Table</summary>
        <table className="table-base mt-1">
          <tbody>
            {data.map((d) => (
              <tr key={d.day}><td>{d.day}</td><td className="text-right tabular-nums">{d.tokens.toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
