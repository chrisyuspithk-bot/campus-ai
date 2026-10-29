import { translate, type Lang } from "@/lib/i18n/dict";

const loc = (lang: Lang) => (lang === "en" ? "en-GB" : "zh-HK");

/** "今晚 23:59 截止" for today, otherwise "10月28日 週二 23:59 截止". */
export function formatDue(date: Date | number, lang: Lang) {
  const d = new Date(date);
  const time = new Intl.DateTimeFormat(loc(lang), { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  if (d.getTime() < Date.now()) return `${translate(lang, "p3.overdue")} · ${formatDate(d, lang)}`;
  if (d.toDateString() === new Date().toDateString()) return translate(lang, "p3.dueTonight", { time });
  return translate(lang, "p3.dueAt", { date: formatDate(d, lang) });
}

export function formatDate(date: Date | number, lang: Lang) {
  return new Intl.DateTimeFormat(loc(lang), { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

export function pct(score: number | null | undefined, max: number | null | undefined) {
  return max ? Math.round(((score ?? 0) / max) * 100) : null;
}
