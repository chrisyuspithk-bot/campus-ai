import Link from "next/link";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { findNavItem } from "@/lib/nav";
import { homeFor } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { isUnlocked } from "@/lib/phase";

/** Direct visits to P2–P6 routes land here instead of a 404 ("未解鎖分組唔死連"). */
export async function LockedPage({ path }: { path: string }) {
  const user = await requireUser();
  const { t } = await getT();
  const item = findNavItem(user.role, path);
  if (!item || isUnlocked(item.phase)) notFound();
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden />
        <h1 className="text-xl font-semibold">{t(item.label)}</h1>
        <p className="mt-2 text-slate-600">{t("common.comingSoon", { phase: `P${item.phase}` })}</p>
        <Link href={homeFor(user.role)} className="btn btn-primary mt-6">{t("common.backHome")}</Link>
      </div>
    </div>
  );
}
