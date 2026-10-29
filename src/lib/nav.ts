import type { Role } from "@/lib/db/schema";
import type { DictKey } from "@/lib/i18n/dict";

export type NavItem = {
  label: DictKey;
  href: string;
  phase: number;
  icon: string;
  /** Feature flag that must be on for this role (from /a/features) */
  feature?: string;
};
export type NavGroup = { label?: DictKey; items: NavItem[] };

// Groups are fixed for P1–P7 (see bhscmc-unified-ui-draft §3); items unlock by phase.
export const NAV: Record<Role, NavGroup[]> = {
  student: [
    {
      items: [
        { label: "nav.home", href: "/s", phase: 1, icon: "home" },
        { label: "nav.ai", href: "/ai", phase: 1, icon: "chat", feature: "ai_chat" },
      ],
    },
    {
      label: "nav.g.learn",
      items: [
        { label: "nav.tutors", href: "/s/tutors", phase: 1, icon: "tutor", feature: "tutors" },
        { label: "nav.studio", href: "/s/studio", phase: 2, icon: "studio", feature: "studio" },
        { label: "nav.essay", href: "/s/essay", phase: 2, icon: "essay", feature: "essay" },
        { label: "nav.practice", href: "/s/practice", phase: 3, icon: "practice" },
        { label: "nav.photoPractice", href: "/s/practice/photo", phase: 7, icon: "camera" },
        { label: "nav.research", href: "/research", phase: 7, icon: "research", feature: "web_search" },
      ],
    },
    {
      label: "nav.g.assess",
      items: [
        { label: "nav.assignments", href: "/s/assignments", phase: 3, icon: "assignment" },
        { label: "nav.wrongbook", href: "/s/wrongbook", phase: 4, icon: "wrongbook" },
      ],
    },
    {
      label: "nav.g.grow",
      items: [
        { label: "nav.progress", href: "/s/progress", phase: 4, icon: "progress" },
        { label: "nav.gaps", href: "/s/progress/gaps", phase: 5, icon: "gaps" },
      ],
    },
    {
      label: "nav.g.create",
      items: [
        { label: "nav.create", href: "/s/create", phase: 2, icon: "create", feature: "create" },
        { label: "nav.library", href: "/s/library", phase: 2, icon: "library" },
        { label: "nav.classes", href: "/s/classes", phase: 3, icon: "classes" },
        { label: "nav.apps", href: "/s/apps", phase: 3, icon: "apps" },
        { label: "nav.videos", href: "/s/videos", phase: 6, icon: "video" },
      ],
    },
  ],
  teacher: [
    {
      items: [
        { label: "nav.dashboard", href: "/t", phase: 1, icon: "home" },
        { label: "nav.ai", href: "/ai", phase: 1, icon: "chat", feature: "ai_chat" },
      ],
    },
    {
      label: "nav.g.prep",
      items: [
        { label: "nav.drafts", href: "/t/drafts", phase: 1, icon: "drafts" },
        { label: "nav.tStudio", href: "/t/studio", phase: 2, icon: "studio", feature: "studio" },
        { label: "nav.tTutors", href: "/t/tutors", phase: 1, icon: "tutor" },
        { label: "nav.media", href: "/t/media", phase: 6, icon: "video" },
        { label: "nav.research", href: "/research", phase: 7, icon: "research", feature: "web_search" },
      ],
    },
    {
      label: "nav.g.bank",
      items: [
        { label: "nav.bank", href: "/t/bank", phase: 3, icon: "bank" },
        { label: "nav.papers", href: "/t/papers", phase: 3, icon: "papers" },
      ],
    },
    {
      label: "nav.g.class",
      items: [
        { label: "nav.classes", href: "/t/classes", phase: 3, icon: "classes" },
        { label: "nav.tAssignments", href: "/t/assignments", phase: 3, icon: "assignment" },
        { label: "nav.alerts", href: "/t/alerts", phase: 3, icon: "alert" },
      ],
    },
    {
      label: "nav.g.grading",
      items: [
        { label: "nav.gradingEssay", href: "/t/grading/essay", phase: 2, icon: "essay", feature: "essay" },
        { label: "nav.grading", href: "/t/grading", phase: 4, icon: "grading" },
        { label: "nav.scan", href: "/t/scan", phase: 5, icon: "scan" },
      ],
    },
    { label: "nav.g.data", items: [{ label: "nav.reports", href: "/t/reports", phase: 4, icon: "reports" }] },
    {
      label: "nav.g.community",
      items: [
        { label: "nav.community", href: "/t/community", phase: 3, icon: "community" },
        { label: "nav.apps", href: "/t/apps", phase: 3, icon: "apps" },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: "nav.overview", href: "/a", phase: 1, icon: "home" },
        { label: "nav.ai", href: "/ai", phase: 1, icon: "chat" },
        { label: "nav.research", href: "/research", phase: 7, icon: "research", feature: "web_search" },
      ],
    },
    {
      label: "nav.g.platform",
      items: [
        { label: "nav.features", href: "/a/features", phase: 1, icon: "toggles" },
        { label: "nav.models", href: "/a/models", phase: 1, icon: "models" },
        { label: "nav.users", href: "/a/users", phase: 1, icon: "users" },
      ],
    },
    {
      label: "nav.g.safety",
      items: [
        { label: "nav.safety", href: "/a/safety", phase: 2, icon: "alert" },
        { label: "nav.policies", href: "/a/policies", phase: 2, icon: "shield" },
        { label: "nav.logs", href: "/a/logs", phase: 2, icon: "logs" },
      ],
    },
    {
      label: "nav.g.school",
      items: [
        { label: "nav.org", href: "/a/org", phase: 3, icon: "org" },
        { label: "nav.moderation", href: "/a/moderation", phase: 3, icon: "shield" },
      ],
    },
    { label: "nav.g.analytics", items: [{ label: "nav.schoolAnalytics", href: "/a/analytics", phase: 4, icon: "reports" }] },
  ],
};

/** Find the nav item for a locked path (used by the "coming soon" catch-all). */
export function findNavItem(role: Role, pathname: string): NavItem | undefined {
  const items = NAV[role].flatMap((g) => g.items);
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Page label for the AI panel context. */
export function pageLabelFor(role: Role, pathname: string): DictKey | undefined {
  if (pathname.startsWith("/me")) return "top.me";
  if (pathname.startsWith("/search")) return "common.search";
  return findNavItem(role, pathname)?.label;
}
