"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle, AppWindow, BarChart3, BookMarked, BookOpen, Boxes, Camera, ClipboardCheck, ClipboardList, Cpu, FileText,
  FolderOpen, Globe, GraduationCap, HelpCircle, Home, Lock, MessageSquare, Network, NotebookPen, Palette, PenLine, ScanLine,
  ScrollText, Shield, SlidersHorizontal, Target, TrendingUp, Users, UsersRound, Video, X, Dumbbell, Library,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { ShellNavGroup, ShellNavItem } from "./AppShell";

const ICONS: Record<string, LucideIcon> = {
  home: Home, chat: MessageSquare, tutor: GraduationCap, studio: BookOpen, essay: PenLine, practice: Dumbbell,
  assignment: ClipboardList, wrongbook: BookMarked, progress: TrendingUp, gaps: Target, create: Palette,
  library: FolderOpen, classes: UsersRound, apps: AppWindow, video: Video, drafts: NotebookPen, bank: Library,
  papers: FileText, alert: AlertTriangle, grading: ClipboardCheck, scan: ScanLine, reports: BarChart3,
  community: Users, toggles: SlidersHorizontal, models: Cpu, users: Users, shield: Shield, logs: ScrollText,
  org: Network, camera: Camera, research: Globe, default: Boxes,
};

function isActive(pathname: string, href: string, all: ShellNavItem[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // Prefer the most specific match (e.g. /t/drafts over /t).
  return !all.some((i) => i.href !== href && i.href.startsWith(href) && (pathname === i.href || pathname.startsWith(i.href + "/")));
}

export function SideNav({ nav, open, onClose }: { nav: ShellNavGroup[]; open: boolean; onClose: () => void }) {
  const { t } = useT();
  const pathname = usePathname();
  const all = nav.flatMap((g) => g.items);

  const body = (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto px-3 py-4">
      {nav.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-5" : ""}>
          {group.label && (
            <div className="mb-1 px-2 text-xs font-semibold tracking-wider text-slate-400">{t(group.label)}</div>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon] ?? ICONS.default;
              const active = isActive(pathname, item.href, all);
              if (item.state !== "ok") {
                const tip = item.state === "locked" ? t("common.comingSoon", { phase: `P${item.phase}` }) : t("nav.disabled");
                return (
                  <li key={item.href}>
                    <span
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-400"
                      title={tip}
                      aria-disabled="true"
                      data-locked={item.state}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{t(item.label)}</span>
                      {item.state === "locked" ? (
                        <span className="phase-badge">P{item.phase}</span>
                      ) : (
                        <Lock className="h-3 w-3" aria-hidden />
                      )}
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                      active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-brand-600" : "text-slate-500"}`} aria-hidden />
                    <span className="truncate">{t(item.label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-auto pt-6">
        <Link href="/help" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
          <HelpCircle className="h-4 w-4" aria-hidden /> {t("nav.help")}
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block print:hidden">{body}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="btn btn-ghost absolute top-2 right-2 p-1.5" onClick={onClose} aria-label={t("common.close")}>
              <X className="h-5 w-5" />
            </button>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
