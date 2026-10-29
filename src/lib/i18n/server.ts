import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/dal";
import { translate, type DictKey, type Lang } from "./dict";

export const LANG_COOKIE = "campus_lang";

/** Signed-in user's language, else the login-page cookie, else zh-Hant. */
export async function getLang(): Promise<Lang> {
  const user = await getCurrentUser();
  if (user) return user.language;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return c === "en" ? "en" : "zh-Hant";
}

export async function getT() {
  const lang = await getLang();
  const t = (key: DictKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return { t, lang };
}
