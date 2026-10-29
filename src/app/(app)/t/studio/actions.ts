"use server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { newId } from "@/lib/ids";
import { ownStudioItem } from "@/lib/studio/server";

/** Worksheet → teacher draft (草稿庫), so it can be edited and exported like any other draft. */
export async function saveWorksheetAsDraft(itemId: string, markdown: string) {
  const user = await requireUser(["teacher"]);
  const item = ownStudioItem(user.id, itemId);
  if (!item || item.kind !== "worksheet") throw new Error("not_found");
  const content = markdown.slice(0, 100_000);
  db.update(schema.libraryItems).set({ data: { markdown: content }, updatedAt: new Date() }).where(eq(schema.libraryItems.id, itemId)).run();
  const id = newId();
  db.insert(schema.drafts).values({ id, ownerId: user.id, title: item.title, type: "worksheet", subject: user.group ?? "", content }).run();
  return appRedirect(`/t/drafts/${id}`);
}
