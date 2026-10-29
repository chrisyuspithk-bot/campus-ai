/** Difficulty 1–3 as ★★☆ (server- and client-safe). */
export function LevelStars({ level, max = 3 }: { level: number; max?: number }) {
  return (
    <span className="text-amber-500" aria-label={`Lv ${level}/${max}`} title={`Lv ${level}/${max}`} data-level={level}>
      {"★".repeat(level)}
      <span className="text-slate-300">{"★".repeat(Math.max(0, max - level))}</span>
    </span>
  );
}
