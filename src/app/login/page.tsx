import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getSetting } from "@/lib/settings";
import { I18nProvider } from "@/lib/i18n/client";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";
import type { DictKey } from "@/lib/i18n/dict";

export const metadata: Metadata = { title: "Login" };

const ERRORS: Record<string, DictKey> = { expired: "login.errExpired", disabled: "login.errDisabled" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const schoolName = getSetting("schoolName");
  const next = typeof sp.next === "string" ? sp.next : "";
  const initialError = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  return (
    <I18nProvider lang={lang}>
      <main className="flex min-h-full flex-col bg-gradient-to-b from-brand-50 via-white to-teal-50">
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center gap-3 text-center">
              <Logo size="lg" />
              <p className="text-base font-medium text-slate-600">{schoolName}</p>
            </div>
            <div className="card p-6 sm:p-7">
              <h1 className="sr-only">{t("login.title")}</h1>
              <LoginForm next={next} initialError={initialError} />
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-between px-6 py-4 text-xs text-slate-500">
          <span />
          <span>v0.1 · Campus AI</span>
        </footer>
      </main>
    </I18nProvider>
  );
}
