"use server";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getLibraryItem, libraryFileDir } from "@/lib/library";

async function own(id: string) {
  const user = await requireUser(["student", "teacher"]);
  const item = getLibraryItem(user.id, id);
  if (!item) throw new Error("not_found");
  return { user, item };
}

function update(ownerId: string, id: string, set: Partial<typeof schema.libraryItems.$inferInsert>) {
  const l = schema.libraryItems;
  db.update(l).set({ ...set, updatedAt: new Date() }).where(and(eq(l.id, id), eq(l.ownerId, ownerId))).run();
  revalidatePath("/s/library");
}

export async function renameLibraryItem(id: string, title: string) {
  const { user } = await own(id);
  const v = title.trim().slice(0, 120);
  if (v) update(user.id, id, { title: v });
}

export async function moveLibraryItem(id: string, folder: string) {
  const { user } = await own(id);
  update(user.id, id, { folder: folder.trim().slice(0, 40) });
}

/** Removes the library entry (and an uploaded file). Essays / create projects themselves are kept. */
export async function deleteLibraryItem(id: string) {
  const { user, item } = await own(id);
  db.delete(schema.libraryItems).where(eq(schema.libraryItems.id, id)).run();
  if (item.kind === "upload") await fs.rm(path.join(libraryFileDir(user.id), id), { force: true });
  revalidatePath("/s/library");
}
