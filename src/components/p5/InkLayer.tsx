import type { InkItem } from "@/lib/db/schema";
import { strokePath } from "@/lib/p5/ink";

/** Read-only SVG rendering of an ink layer (used by the editor and the student's script view). */
export function InkItems({ items, onPick }: { items: InkItem[]; onPick?: (i: number) => void }) {
  return (
    <>
      {items.map((it, i) => {
        const pick = onPick ? { onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); onPick(i); }, style: { cursor: "pointer" } } : {};
        if (it.t === "pen") return <path key={i} d={strokePath(it.p)} stroke={it.c} strokeWidth={it.w} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pick} />;
        if (it.t === "stamp") {
          return (
            <g key={i} {...pick}>
              <circle cx={it.x} cy={it.y} r={34} fill="none" stroke={it.c} strokeWidth={4} opacity={0.85} />
              <text x={it.x} y={it.y} fill={it.c} fontSize={40} fontWeight={700} textAnchor="middle" dominantBaseline="central">{it.s}</text>
            </g>
          );
        }
        return <text key={i} x={it.x} y={it.y} fill={it.c} fontSize={30} fontWeight={600} dominantBaseline="hanging" {...pick}>{it.s}</text>;
      })}
    </>
  );
}

/** A scanned page with its ink overlay (static). */
export function InkPage({ url, width, height, items, alt }: { url: string; width: number; height: number; items: InkItem[]; alt: string }) {
  const h = Math.round((1000 * (height || 1414)) / (width || 1000));
  return (
    <div className="relative w-full overflow-hidden rounded border border-slate-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block w-full select-none" draggable={false} />
      <svg viewBox={`0 0 1000 ${h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <InkItems items={items} />
      </svg>
    </div>
  );
}
