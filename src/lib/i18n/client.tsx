"use client";
import { createContext, useCallback, useContext } from "react";
import { translate, type DictKey, type Lang } from "./dict";

const LangContext = createContext<Lang>("zh-Hant");

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useT() {
  const lang = useContext(LangContext);
  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
