import { translate, type Lang } from "@/lib/i18n/dict";

export function relativeTime(date: Date | number, lang: Lang) {
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return translate(lang, "common.justNow");
  if (min < 60) return translate(lang, "common.minutesAgo", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return translate(lang, "common.hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d === 1) return translate(lang, "common.yesterday");
  return translate(lang, "common.daysAgo", { n: d });
}

export function formatNumber(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}
