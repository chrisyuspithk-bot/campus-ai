"use client";
import { useEffect, useMemo, useState } from "react";
import { Shield, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { Markdown } from "@/components/Markdown";
import { sandboxDoc } from "@/lib/p6/sandbox";

/** A teacher-built app that passed review (P6). Runs in a sandboxed iframe with no network. */
export type CustomApp = { id: string; title: string; emoji: string; description: string; subject: string; owner: string; version: number; html: string; teacherOnly: boolean };

type AppDef = { slug: "timer" | "picker" | "wordcount" | "formula" | "units"; emoji: string; teacherOnly?: boolean };

/** School-approved mini apps: ready-made (P3) + teacher-built apps that passed review (P6). */
const APPS: AppDef[] = [
  { slug: "timer", emoji: "⏱️" },
  { slug: "picker", emoji: "🎲", teacherOnly: true },
  { slug: "wordcount", emoji: "🔢" },
  { slug: "formula", emoji: "📐" },
  { slug: "units", emoji: "📏" },
];

export function AppGallery({ role, custom = [] }: { role: "student" | "teacher"; custom?: CustomApp[] }) {
  const { t } = useT();
  const apps = APPS.filter((a) => role === "teacher" || !a.teacherOnly);
  const [open, setOpen] = useState<AppDef["slug"] | null>(null);
  const [openCustom, setOpenCustom] = useState<CustomApp | null>(null);
  const current = apps.find((a) => a.slug === open);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="app-gallery">
        {apps.map((a) => (
          <div key={a.slug} className="card flex flex-col p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-2xl" aria-hidden>{a.emoji}</span>
              <div className="min-w-0">
                <div className="font-semibold">{t(`ap.${a.slug}.name` as DictKey)}</div>
                <div className="text-xs text-slate-500">{t(`ap.${a.slug}.desc` as DictKey)}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="badge bg-emerald-50 text-emerald-700">✓ {t("ap.approved")}</span>
              {a.teacherOnly && <span className="badge">{t("ap.teacherOnly")}</span>}
              <button className="btn btn-sm btn-primary ml-auto" onClick={() => setOpen(a.slug)}>{t("ap.open")}</button>
            </div>
          </div>
        ))}
        {custom.map((a) => (
          <div key={a.id} className="card flex flex-col p-4" data-testid="custom-app">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-2xl" aria-hidden>{a.emoji}</span>
              <div className="min-w-0">
                <div className="font-semibold">{a.title}</div>
                <div className="text-xs text-slate-500">{a.description || a.subject}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="badge bg-emerald-50 text-emerald-700">✓ {t("ap.approved")}</span>
              <span className="truncate text-slate-400">{a.owner} · v{a.version}</span>
              {a.teacherOnly && <span className="badge">{t("ap.teacherOnly")}</span>}
              <button className="btn btn-sm btn-primary ml-auto" onClick={() => setOpenCustom(a)}>{t("ap.open")}</button>
            </div>
          </div>
        ))}
      </div>

      {openCustom && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={openCustom.title} onClick={() => setOpenCustom(null)}>
          <div className="card flex h-[85vh] w-full max-w-3xl flex-col p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-2xl" aria-hidden>{openCustom.emoji}</span>
              <h2 className="flex-1 text-lg font-semibold">{openCustom.title}</h2>
              <span className="badge bg-emerald-50 text-emerald-700" title={t("p6.ap.previewSandbox")}><Shield className="h-3.5 w-3.5" /> sandbox</span>
              <button className="btn btn-ghost p-1" onClick={() => setOpenCustom(null)} aria-label={t("ap.close")}><X className="h-5 w-5" /></button>
            </div>
            <iframe sandbox="allow-scripts" srcDoc={sandboxDoc(openCustom.html)} title={openCustom.title} className="min-h-0 flex-1 rounded-lg border border-slate-200 bg-white" data-testid="custom-app-frame" />
          </div>
        </div>
      )}

      {current && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={t(`ap.${current.slug}.name` as DictKey)} onClick={() => setOpen(null)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl" aria-hidden>{current.emoji}</span>
              <h2 className="flex-1 text-lg font-semibold">{t(`ap.${current.slug}.name` as DictKey)}</h2>
              <button className="btn btn-ghost p-1" onClick={() => setOpen(null)} aria-label={t("ap.close")}><X className="h-5 w-5" /></button>
            </div>
            {current.slug === "timer" && <TimerApp />}
            {current.slug === "picker" && <PickerApp />}
            {current.slug === "wordcount" && <WordCountApp />}
            {current.slug === "formula" && <FormulaApp />}
            {current.slug === "units" && <UnitsApp />}
          </div>
        </div>
      )}
    </div>
  );
}

function TimerApp() {
  const { t } = useT();
  const [total, setTotal] = useState(300);
  const [left, setLeft] = useState(300);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => setLeft((s) => (s <= 1 ? (setRunning(false), 0) : s - 1)), 1000);
    return () => clearInterval(h);
  }, [running]);
  return (
    <div className="text-center">
      <div className={`font-mono text-6xl font-bold tabular-nums ${left === 0 ? "text-rose-600" : ""}`}>{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {[1, 3, 5, 10, 15].map((m) => <button key={m} className="btn btn-sm" onClick={() => { setTotal(m * 60); setLeft(m * 60); setRunning(false); }}>{m}′</button>)}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn btn-primary" onClick={() => setRunning((r) => !r)} disabled={left === 0}>{running ? t("ap.timer.pause") : t("ap.timer.start")}</button>
        <button className="btn" onClick={() => { setLeft(total); setRunning(false); }}>{t("ap.timer.reset")}</button>
      </div>
    </div>
  );
}

function PickerApp() {
  const { t } = useT();
  const [names, setNames] = useState("阿明\n阿華\n嘉欣\n子軒\n樂兒");
  const [picked, setPicked] = useState<string | null>(null);
  const list = names.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <label className="label" htmlFor="pick-names">{t("ap.picker.names")}</label>
      <textarea id="pick-names" className="input min-h-32" value={names} onChange={(e) => setNames(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={!list.length} onClick={() => setPicked(list[Math.floor(Math.random() * list.length)])}>{t("ap.picker.pick")}</button>
        {picked && <span className="text-2xl font-bold text-brand-700">{picked}</span>}
      </div>
    </div>
  );
}

function WordCountApp() {
  const { t } = useT();
  const [text, setText] = useState("");
  const stats = useMemo(() => ({
    cjk: (text.match(/[㐀-鿿]/g) ?? []).length,
    words: (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length,
    sentences: (text.match(/[^。！？.!?]+[。！？.!?]/g) ?? []).length,
  }), [text]);
  return (
    <div>
      <textarea className="input min-h-40" placeholder={t("ap.wordcount.ph")} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(["cjk", "words", "sentences"] as const).map((k) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2"><div className="text-xl font-bold">{stats[k]}</div><div className="text-xs text-slate-500">{t(`ap.wordcount.${k}`)}</div></div>
        ))}
      </div>
    </div>
  );
}

const FORMULAS = `**代數**
- $(a+b)^2 = a^2 + 2ab + b^2$
- $a^2 - b^2 = (a+b)(a-b)$
- 二次公式：$x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

**幾何**
- 畢氏定理：$a^2 + b^2 = c^2$
- 圓面積 $\\pi r^2$，圓周 $2\\pi r$
- 圓柱體積 $\\pi r^2 h$

**三角**
- $\\sin\\theta = \\dfrac{對邊}{斜邊}$，$\\cos\\theta = \\dfrac{鄰邊}{斜邊}$，$\\tan\\theta = \\dfrac{對邊}{鄰邊}$`;

function FormulaApp() {
  return <Markdown>{FORMULAS}</Markdown>;
}

const UNITS = {
  length: { m: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, ft: 0.3048 },
  mass: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592 },
} as const;

function UnitsApp() {
  const { t } = useT();
  const [value, setValue] = useState(1);
  const [kind, setKind] = useState<"length" | "mass" | "temp">("length");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["length", "mass", "temp"] as const).map((k) => <button key={k} className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`} onClick={() => setKind(k)}>{k === "length" ? "m" : k === "mass" ? "kg" : "°C"}</button>)}
      </div>
      <label className="label" htmlFor="unit-v">{t("ap.units.value")} ({kind === "length" ? "m" : kind === "mass" ? "kg" : "°C"})</label>
      <input id="unit-v" type="number" className="input" value={value} onChange={(e) => setValue(Number(e.target.value))} />
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {kind === "temp" ? (
          <>
            <li className="rounded-lg bg-slate-50 p-2">{(value * 9 / 5 + 32).toFixed(1)} °F</li>
            <li className="rounded-lg bg-slate-50 p-2">{(value + 273.15).toFixed(2)} K</li>
          </>
        ) : (
          Object.entries(UNITS[kind]).map(([u, f]) => <li key={u} className="rounded-lg bg-slate-50 p-2">{+(value / f).toPrecision(6)} {u}</li>)
        )}
      </ul>
    </div>
  );
}
