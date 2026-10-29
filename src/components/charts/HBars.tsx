/** Single-series horizontal bars (0–100 or any max). Value labels in text ink; one hue, no legend. */
export function HBars({ data, max = 100, suffix = "" }: { data: { label: string; value: number | null; hint?: string }[]; max?: number; suffix?: string }) {
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm" title={d.hint ?? `${d.label}: ${d.value ?? "—"}${suffix}`}>
          <span className="truncate text-slate-600">{d.label}</span>
          <span className="h-3 rounded-full bg-slate-100">
            {d.value != null && <span className="block h-3 rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: "#6366f1" }} />}
          </span>
          <span className="text-right tabular-nums text-slate-700">{d.value != null ? `${d.value}${suffix}` : "—"}</span>
        </li>
      ))}
    </ul>
  );
}
