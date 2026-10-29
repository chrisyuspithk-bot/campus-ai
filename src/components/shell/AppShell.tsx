"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Lock, Megaphone } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { Role } from "@/lib/db/schema";
import type { DictKey } from "@/lib/i18n/dict";
import { TopBar } from "./TopBar";
import { SideNav } from "./SideNav";
import { AIPanel } from "./AIPanel";

export type ShellNavItem = { label: DictKey; href: string; icon: string; phase: number; state: "ok" | "locked" | "disabled" };
export type ShellNavGroup = { label?: DictKey; items: ShellNavItem[] };
export type ShellUser = { displayName: string; role: Role; avatar: string };

const PANEL_KEY = "campus.aiPanel";

export function AppShell(props: {
  user: ShellUser;
  nav: ShellNavGroup[];
  announcement: string;
  quotaPercent: number;
  aiEnabled: boolean;
  examLock?: { assignmentId: string; title: string } | null;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const onChatPage = pathname === "/ai" || pathname.startsWith("/ai/");

  // Restore the panel preference after hydration (default: collapsed).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (localStorage.getItem(PANEL_KEY) === "1") setPanelOpen(true);
  }, []);
  const togglePanel = () =>
    setPanelOpen((v) => {
      localStorage.setItem(PANEL_KEY, v ? "0" : "1");
      return !v;
    });

  // Close the mobile drawer on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setNavOpen(false);
  }

  const showPanel = panelOpen && !onChatPage && props.aiEnabled;

  // Exam attempt: full-screen exam shell — no side nav, no top-bar AI, no AI panel.
  if (/^\/s\/assignments\/[^/]+\/attempt\/?$/.test(pathname)) {
    return <div className="h-full overflow-y-auto bg-slate-50">{props.children}</div>;
  }

  return (
    <div className="flex h-full flex-col print:h-auto">
      <TopBar
        user={props.user}
        onToggleNav={() => setNavOpen((v) => !v)}
        onTogglePanel={togglePanel}
        panelOpen={showPanel}
        panelAvailable={!onChatPage && props.aiEnabled}
        quotaPercent={props.quotaPercent}
      />
      {props.announcement && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
          <span>{props.announcement}</span>
        </div>
      )}
      {props.examLock && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900" data-testid="exam-lock-banner">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("p3.examLockedTitle")} · {props.examLock.title}</span>
          <Link href={`/s/assignments/${props.examLock.assignmentId}/attempt`} className="btn btn-sm">{t("p3.backToExam")}</Link>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <SideNav nav={props.nav} open={navOpen} onClose={() => setNavOpen(false)} />
        <main id="main" className="min-w-0 flex-1 overflow-y-auto print:overflow-visible">
          {props.children}
        </main>
        {showPanel && <AIPanel user={props.user} onClose={togglePanel} />}
      </div>
    </div>
  );
}
