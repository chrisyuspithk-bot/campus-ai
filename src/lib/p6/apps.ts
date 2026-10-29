import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";

export type AppListing = typeof schema.appListings.$inferSelect;
export const MAX_APPS_PER_TEACHER = 12;
export const MAX_APP_BYTES = 200_000;

/** Published apps (have a reviewed snapshot) visible to a role. */
export function galleryApps(role: Role) {
  const a = schema.appListings;
  return db
    .select({ app: a, owner: schema.users.displayName })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.ownerId))
    .where(ne(a.publishedHtml, ""))
    .orderBy(desc(a.updatedAt))
    .all()
    .filter((r) => role !== "student" || r.app.audience === "all")
    .map((r) => ({ id: r.app.id, title: r.app.title, emoji: r.app.emoji, description: r.app.description, subject: r.app.subject, owner: r.owner ?? "", version: r.app.version, html: r.app.publishedHtml, teacherOnly: r.app.audience === "teacher" }));
}
export type GalleryApp = ReturnType<typeof galleryApps>[number];

export function myApps(ownerId: string) {
  return db.select().from(schema.appListings).where(eq(schema.appListings.ownerId, ownerId)).orderBy(desc(schema.appListings.updatedAt)).all();
}

export function getOwnApp(id: string, ownerId: string) {
  return db.select().from(schema.appListings).where(and(eq(schema.appListings.id, id), eq(schema.appListings.ownerId, ownerId))).get();
}

export { APP_TEMPLATES, type TemplateKey } from "./app-templates";
