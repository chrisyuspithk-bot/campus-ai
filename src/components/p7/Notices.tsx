import Link from "next/link";
import { Bell } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { unreadNotices } from "@/lib/p7/notify";
import { markNoticesReadAction } from "./actions";

/** P7 in-app notices (high-risk safety auto-reports). Renders nothing when there are none. */
export async function Notices({ userId }: { userId: string }) {
  const rows = unreadNotices(userId);
  if (!rows.length) return null;
  const { t, lang } = await getT();
  return (
    <section className="card mb-4 border-rose-200 bg-rose-50/60 p-4" data-testid="notices">
      <div className="mb-2 flex items-center gap-2">
        <Bell className="h-4 w-4 text-rose-600" aria-hidden />
        <h2 className="font-semibold text-rose-900">{t("p7.notice.title", { n: rows.length })}</h2>
        <form action={markNoticesReadAction} className="ml-auto"><button className="btn btn-sm">{t("p7.notice.read")}</button></form>
      </div>
      <ul className="space-y-1 text-sm">
        {rows.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-2">
            <Link href={n.href || "#"} className="font-medium text-rose-800 hover:underline">{n.title}</Link>
            <span className="text-slate-600">{n.body}</span>
            <span className="ml-auto text-xs text-slate-400">{relativeTime(n.createdAt, lang)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
