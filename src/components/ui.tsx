import Link from "next/link";
import { Lock } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full px-4 py-6 sm:px-6 lg:py-8 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>{children}</div>;
}

export function SectionHeader({ title, href, linkLabel }: { title: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="section-title">{title}</h2>
      {href && linkLabel && (
        <Link href={href} className="text-sm font-medium text-brand-600 hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** Gray, non-clickable card for modules that unlock in a later phase (no dead links). */
export function LockedTile({ icon, label, phase, desc, tip }: { icon?: React.ReactNode; label: string; phase: number; desc?: string; tip: string }) {
  return (
    <div className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-400" title={tip} aria-disabled="true">
      <span className="text-xl grayscale" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {label} <span className="phase-badge">P{phase}</span>
        </div>
        {desc && <p className="mt-0.5 text-xs">{desc}</p>}
      </div>
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </div>
  );
}

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
