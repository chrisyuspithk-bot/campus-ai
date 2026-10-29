import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const SETTING_DEFAULTS = {
  schoolName: "佛教孔仙洲紀念中學",
  announcement: "",
  imageModel: "google/gemini-3.1-flash-image",
  yearEndPolicy: "archive" as "archive" | "delete",
  /** P6 /a/org permission matrix (JSON: {perm: Role[]}); "" = defaults */
  orgPermissions: "",
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export function getSetting<K extends SettingKey>(key: K): (typeof SETTING_DEFAULTS)[K] {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return (row?.value ?? SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K];
}

export function setSetting(key: SettingKey, value: string) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
