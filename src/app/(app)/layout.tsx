import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { quotaStatus } from "@/lib/quota";
import { getSetting } from "@/lib/settings";
import { NAV } from "@/lib/nav";
import { isUnlocked } from "@/lib/phase";
import { I18nProvider } from "@/lib/i18n/client";
import { AppShell, type ShellNavGroup } from "@/components/shell/AppShell";
import { activeLockedAttempt } from "@/lib/p3/exam";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const features = featuresFor(user.role);
  const quota = quotaStatus(user.id, user.role);
  // P3 exam lock: while an AI-locked attempt is open, every AI entry point is hidden.
  const lock = user.role === "student" ? activeLockedAttempt(user.id) : null;

  const nav: ShellNavGroup[] = NAV[user.role].map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({
      label: i.label,
      href: i.href,
      icon: i.icon,
      phase: i.phase,
      state:
        !isUnlocked(i.phase)
          ? "locked"
          : (i.feature && !features[i.feature as keyof typeof features]) || (lock && (i.href === "/ai" || i.href === "/research" || i.href === "/s/practice/photo"))
            ? "disabled"
            : "ok",
    })),
  }));

  return (
    <I18nProvider lang={user.language}>
      <AppShell
        user={{ displayName: user.displayName, role: user.role, avatar: user.avatar }}
        nav={nav}
        announcement={getSetting("announcement")}
        quotaPercent={quota.percent}
        aiEnabled={features.ai_chat && !lock}
        examLock={lock ? { assignmentId: lock.assignment.id, title: lock.assignment.title } : null}
      >
        {children}
      </AppShell>
    </I18nProvider>
  );
}
