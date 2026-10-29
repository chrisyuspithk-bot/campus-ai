import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Logo } from "@/components/Logo";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <Logo />
        <p className="mt-6 text-5xl font-bold text-slate-300">404</p>
        <p className="mt-2 text-slate-600">{t("common.notFound")}</p>
        <Link href="/" className="btn btn-primary mt-6">{t("common.backHome")}</Link>
      </div>
    </div>
  );
}
