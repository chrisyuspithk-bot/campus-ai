"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, School } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { login, setLoginLanguage, type LoginState } from "./actions";

const DEMO = [
  { username: "s123", role: "role.student", name: "阿明" },
  { username: "t09", role: "role.teacher", name: "陳老師" },
  { username: "admin", role: "role.admin", name: "IT" },
] as const;

export function LoginForm({ next, initialError }: { next: string; initialError?: DictKey }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: initialError });
  const [showPw, setShowPw] = useState(false);
  const [info, setInfo] = useState<DictKey | null>(null);
  const [, startTransition] = useTransition();
  const userRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const invalid = state.error === "login.errInvalid" || state.error === "login.errRequired";

  function fillDemo(username: string) {
    if (userRef.current) userRef.current.value = username;
    if (pwRef.current) pwRef.current.value = "demo1234";
  }

  function switchLang(l: "zh-Hant" | "en") {
    startTransition(async () => {
      await setLoginLanguage(l);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <button type="button" className="btn btn-primary w-full py-2.5 text-base" onClick={() => setInfo("login.ssoNotConfigured")}>
        <School className="h-5 w-5" aria-hidden /> {t("login.sso")}
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        {t("login.or")}
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="username" className="label">{t("login.username")}</label>
          <input
            ref={userRef}
            id="username"
            name="username"
            autoComplete="username"
            required
            defaultValue={state.username}
            disabled={pending}
            aria-invalid={invalid}
            className={`input py-2.5 text-base ${invalid ? "border-rose-400 ring-2 ring-rose-100" : ""}`}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">{t("login.password")}</label>
          <div className="relative">
            <input
              ref={pwRef}
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              aria-invalid={invalid}
              className={`input py-2.5 pr-10 text-base ${invalid ? "border-rose-400 ring-2 ring-rose-100" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600"
              aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-600" title={t("login.rememberHint")}>
          <input type="checkbox" name="remember" className="mt-0.5 h-4 w-4 rounded border-slate-300" disabled={pending} />
          {t("login.remember")}
        </label>

        {state.error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {t(state.error)}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full py-2.5 text-base" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {pending ? t("login.submitting") : t("login.submit")}
        </button>
      </form>

      <div className="flex justify-center gap-3 text-sm text-brand-600">
        <button type="button" className="hover:underline" onClick={() => setInfo("login.forgotHint")}>{t("login.forgot")}</button>
        <span className="text-slate-300">｜</span>
        <button type="button" className="hover:underline" onClick={() => setInfo("login.ssoNotConfigured")}>{t("login.help")}</button>
      </div>
      {info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">{t(info)}</p>}

      <div className="rounded-lg border border-dashed border-slate-300 p-3">
        <p className="mb-2 text-xs font-medium text-slate-500">
          {t("login.demo")} · {t("login.demoPassword")} <code className="rounded bg-slate-100 px-1">demo1234</code>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO.map((d) => (
            <button key={d.username} type="button" onClick={() => fillDemo(d.username)} className="btn btn-sm flex-col gap-0 py-1.5">
              <span className="font-semibold">{t(d.role)}</span>
              <span className="text-[11px] text-slate-500">{d.username}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
        {t("login.language")}:
        <button type="button" onClick={() => switchLang("zh-Hant")} className={lang === "zh-Hant" ? "font-semibold text-brand-700" : "hover:underline"}>繁中</button>
        ｜
        <button type="button" onClick={() => switchLang("en")} className={lang === "en" ? "font-semibold text-brand-700" : "hover:underline"}>Eng</button>
      </div>
    </div>
  );
}
