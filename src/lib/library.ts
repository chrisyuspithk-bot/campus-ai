import "server-only";
import path from "node:path";
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LibraryKind, LibrarySource, Role } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { UPLOADS_DIR } from "@/lib/paths";

export type LibraryItem = typeof schema.libraryItems.$inferSelect;

export const LIBRARY_KINDS: LibraryKind[] = ["mindmap", "flashcards", "quiz", "worksheet", "youtube", "essay", "create", "upload"];

export function libraryFileDir(ownerId: string) {
  return path.join(UPLOADS_DIR, "library", ownerId);
}

export function listLibrary(ownerId: string, f: { kind?: string; folder?: string; q?: string; source?: LibrarySource } = {}) {
  const l = schema.libraryItems;
  const conds: SQL[] = [eq(l.ownerId, ownerId)];
  if (f.kind && (LIBRARY_KINDS as string[]).includes(f.kind)) conds.push(eq(l.kind, f.kind as LibraryKind));
  if (f.source) conds.push(eq(l.source, f.source));
  if (f.folder) conds.push(eq(l.folder, f.folder));
  if (f.q) conds.push(or(like(l.title, `%${f.q}%`), like(l.text, `%${f.q}%`))!);
  const rows = db
    .select({
      id: l.id,
      kind: l.kind,
      source: l.source,
      title: l.title,
      folder: l.folder,
      refId: l.refId,
      filename: l.filename,
      size: l.size,
      hasText: l.text,
      updatedAt: l.updatedAt,
    })
    .from(l)
    .where(and(...conds))
    .orderBy(desc(l.updatedAt))
    .all()
    .map((r) => ({ ...r, hasText: r.hasText.trim().length > 0 }));

  // Drop create/essay rows whose target was deleted (avoids library "開" → 404).
  return rows.filter((r) => {
    if (!r.refId) return r.kind !== "create" && r.kind !== "essay";
    if (r.kind === "create") {
      return !!db.select({ id: schema.createProjects.id }).from(schema.createProjects).where(eq(schema.createProjects.id, r.refId)).get();
    }
    if (r.kind === "essay") {
      return !!db.select({ id: schema.essays.id }).from(schema.essays).where(eq(schema.essays.id, r.refId)).get();
    }
    return true;
  });
}

/** Remove library rows that point at missing create/essay targets (one-shot hygiene). */
export function pruneOrphanLibraryRefs(ownerId?: string) {
  const l = schema.libraryItems;
  const rows = ownerId
    ? db.select().from(l).where(eq(l.ownerId, ownerId)).all()
    : db.select().from(l).all();
  let n = 0;
  for (const r of rows) {
    if (!r.refId) continue;
    let dead = false;
    if (r.kind === "create") {
      dead = !db.select({ id: schema.createProjects.id }).from(schema.createProjects).where(eq(schema.createProjects.id, r.refId)).get();
    } else if (r.kind === "essay") {
      dead = !db.select({ id: schema.essays.id }).from(schema.essays).where(eq(schema.essays.id, r.refId)).get();
    }
    if (dead) {
      db.delete(l).where(eq(l.id, r.id)).run();
      n++;
    }
  }
  return n;
}

export function listFolders(ownerId: string) {
  const rows = db.selectDistinct({ f: schema.libraryItems.folder }).from(schema.libraryItems).where(eq(schema.libraryItems.ownerId, ownerId)).all();
  return rows.map((r) => r.f).filter(Boolean).sort();
}

export function getLibraryItem(ownerId: string, id: string) {
  return db
    .select()
    .from(schema.libraryItems)
    .where(and(eq(schema.libraryItems.id, id), eq(schema.libraryItems.ownerId, ownerId)))
    .get();
}

export function createLibraryItem(v: {
  ownerId: string;
  kind: LibraryKind;
  source: LibrarySource;
  title: string;
  folder?: string;
  data?: unknown;
  text?: string;
  refId?: string | null;
  filename?: string | null;
  mime?: string | null;
  size?: number;
}) {
  const id = newId();
  db.insert(schema.libraryItems)
    .values({ id, ...v, title: v.title.slice(0, 120) || "Untitled", text: v.text ?? "", size: v.size ?? 0 })
    .run();
  return id;
}

/** Where "open" goes for an item — the tool that produced it. */
export function openHref(item: { id: string; kind: LibraryKind; refId: string | null }, role: Role) {
  const base = role === "teacher" ? "/t/studio" : "/s/studio";
  switch (item.kind) {
    case "mindmap":
    case "flashcards":
    case "quiz":
    case "worksheet":
    case "youtube":
      return `${base}/${item.kind}/${item.id}`;
    case "essay":
      return item.refId ? `/s/essay/${item.refId}` : "/s/essay";
    case "create":
      return item.refId ? `/s/create/${item.refId}` : "/s/create";
    case "upload":
      return null; // served by /api/library/:id/file
  }
}
