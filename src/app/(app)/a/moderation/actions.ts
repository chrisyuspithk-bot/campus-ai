"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";

export async function moderatePost(form: FormData) {
  const user = await requireUser(["admin"]);
  const id = String(form.get("id") ?? "");
  const approve = form.get("decision") === "approve";
  const p = db.select().from(schema.communityPosts).where(eq(schema.communityPosts.id, id)).get();
  if (!p) return;
  db.update(schema.communityPosts)
    .set({ status: approve ? "approved" : "rejected", reviewNote: String(form.get("note") ?? "").slice(0, 300) })
    .where(eq(schema.communityPosts.id, id))
    .run();
  audit(user, approve ? "community.approve" : "community.reject", p.title);
  revalidatePath("/a/moderation");
}

/** P6 app listing review: approve snapshots the submitted code as the live version. */
export async function reviewApp(form: FormData) {
  const user = await requireUser(["admin"]);
  const id = String(form.get("id") ?? "");
  const approve = form.get("decision") === "approve";
  const a = db.select().from(schema.appListings).where(eq(schema.appListings.id, id)).get();
  if (!a || a.status !== "pending") return;
  const note = String(form.get("note") ?? "").slice(0, 300);
  db.update(schema.appListings)
    .set(approve ? { status: "approved", publishedHtml: a.html, version: a.version + 1, reviewNote: note, updatedAt: new Date() } : { status: "rejected", reviewNote: note || "—", updatedAt: new Date() })
    .where(eq(schema.appListings.id, id))
    .run();
  audit(user, approve ? "app.approve" : "app.reject", a.title, note);
  revalidatePath("/a/moderation");
  revalidatePath("/s/apps");
  revalidatePath("/t/apps");
}

/** Take a live app out of the gallery (keeps the teacher's working copy). */
export async function unlistApp(form: FormData) {
  const user = await requireUser(["admin"]);
  const id = String(form.get("id") ?? "");
  const a = db.select().from(schema.appListings).where(eq(schema.appListings.id, id)).get();
  if (!a) return;
  db.update(schema.appListings).set({ publishedHtml: "", status: a.status === "approved" ? "draft" : a.status, reviewNote: "已下架", updatedAt: new Date() }).where(eq(schema.appListings.id, id)).run();
  audit(user, "app.unlist", a.title);
  revalidatePath("/a/moderation");
}
