"use client";
import Link from "next/link";
import { useState } from "react";
import { BookCheck, Check, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";

type Tutor = {
  slug: string;
  name: string;
  subject: string;
  emoji: string;
  levels: string[];
  strategy: string;
  tagline: string;
  blurb: string;
  will: string[];
  wont: string[];
  topics: string;
  fileCount: number;
  open: boolean;
};

const LEVELS = ["S1", "S2", "S3", "S4", "S5", "S6"];

export function TutorGrid({ tutors, schoolName }: { tutors: Tutor[]; schoolName: string }) {
  const { t } = useT();
  const [level, setLevel] = useState("");
  const [intro, setIntro] = useState<Tutor | null>(null);
  const shown = tutors
    .filter((x) => !level || x.levels.includes(level))
    .sort((a, b) => Number(b.open) - Number(a.open));

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="level" className="text-sm text-slate-600">{t("tutors.filter")}:</label>
        <select id="level" className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">{t("tutors.allLevels")}</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((tu) => (
          <article key={tu.slug} className={`card flex flex-col p-5 ${tu.open ? "" : "bg-slate-50 opacity-60"}`} data-testid={`tutor-${tu.slug}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>{tu.emoji}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{tu.name}</h2>
                <p className="text-xs text-slate-500">
                  {tu.levels[0]}–{tu.levels[tu.levels.length - 1]} · {t(`tutors.strategy.${tu.strategy}` as DictKey)}
                </p>
              </div>
              {!tu.open && <span className="badge">{t("tutors.notOpen")}</span>}
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
              <BookCheck className="h-3.5 w-3.5" aria-hidden />
              {tu.fileCount > 0 ? t("tutors.kb", { n: tu.fileCount }) : t("tutors.kbNone")}
            </p>
            {tu.tagline && <p className="mt-2 text-sm text-slate-700">「{tu.tagline}」</p>}
            <div className="mt-4 flex gap-2 pt-1">
              {tu.open ? (
                <Link href={`/ai?tutor=${tu.slug}`} className="btn btn-primary flex-1">{t("tutors.start")}</Link>
              ) : (
                <span className="btn flex-1 cursor-not-allowed opacity-60">{t("tutors.notOpen")}</span>
              )}
              <button className="btn" onClick={() => setIntro(tu)}>{t("tutors.intro")}</button>
            </div>
          </article>
        ))}
      </div>

      {intro && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="intro-title" onClick={() => setIntro(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="text-4xl" aria-hidden>{intro.emoji}</span>
              <div className="flex-1">
                <h2 id="intro-title" className="text-lg font-semibold">{intro.name}</h2>
                <p className="text-sm text-slate-500">{schoolName}</p>
              </div>
              <button className="btn btn-ghost p-1" onClick={() => setIntro(null)} aria-label={t("common.close")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {intro.blurb && <p className="mt-4 text-sm text-slate-700">{intro.blurb}</p>}
            <div className="mt-4 space-y-3 text-sm">
              {intro.will.length > 0 && (
                <div>
                  <div className="font-medium text-teal-700">{t("tutors.will")}</div>
                  <ul className="mt-1 space-y-1">{intro.will.map((w) => <li key={w} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-teal-600" />{w}</li>)}</ul>
                </div>
              )}
              {intro.wont.length > 0 && (
                <div>
                  <div className="font-medium text-rose-700">{t("tutors.wont")}</div>
                  <ul className="mt-1 space-y-1">{intro.wont.map((w) => <li key={w} className="flex gap-2"><X className="h-4 w-4 shrink-0 text-rose-500" />{w}</li>)}</ul>
                </div>
              )}
              {intro.topics && (
                <p><span className="font-medium">{t("tutors.topics")}：</span>{intro.topics}</p>
              )}
            </div>
            {intro.open && (
              <Link href={`/ai?tutor=${intro.slug}`} className="btn btn-primary mt-6 w-full">{t("tutors.start")}</Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
