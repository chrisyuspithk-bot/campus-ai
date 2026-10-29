"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { paperQuestions } from "@/lib/p3/exam";

/** source = "draft:<id>" | "paper:<id>" | "tutor:<id>" (own items only). Goes to moderation first. */
export async function sharePost(form: FormData) {
  const user = await requireUser(["teacher"]);
  const [kind, id] = String(form.get("source") ?? "").split(":");
  const description = String(form.get("description") ?? "").slice(0, 500);
  let post: Omit<typeof schema.communityPosts.$inferInsert, "id"> | null = null;
  if (kind === "draft") {
    const d = db.select().from(schema.drafts).where(and(eq(schema.drafts.id, id), eq(schema.drafts.ownerId, user.id))).get();
    if (d) post = { authorId: user.id, kind: "worksheet", subject: d.subject, title: d.title, description, content: d.content.slice(0, 20_000), refId: d.id };
  } else if (kind === "paper") {
    const p = db.select().from(schema.papers).where(and(eq(schema.papers.id, id), eq(schema.papers.ownerId, user.id))).get();
    if (p) {
      const qs = paperQuestions(p.id);
      const outline = p.sections.map((s) => `## ${s.title}\n${qs.filter((q) => s.questionIds.includes(q.id)).map((q, i) => `${i + 1}. ${q.stem.split("\n")[0]}`).join("\n")}`).join("\n\n");
      post = { authorId: user.id, kind: "paper", subject: p.subject, title: p.title, description, content: `# ${p.title}\n\n${outline}`, refId: p.id };
    }
  } else if (kind === "tutor") {
    const tu = db.select().from(schema.tutors).where(and(eq(schema.tutors.id, id), eq(schema.tutors.ownerId, user.id))).get();
    if (tu) post = { authorId: user.id, kind: "tutor", subject: tu.subject, title: tu.name, description, content: `Strategy: ${tu.strategy}\nTopics: ${tu.topics}\n\nWill:\n${tu.will}\n\nWon't:\n${tu.wont}`, refId: tu.id };
  }
  if (!post) return appRedirect("/t/community?err=1");
  db.insert(schema.communityPosts).values({ ...post, id: newId(), status: "pending" }).run();
  audit(user, "community.share", post.title);
  return appRedirect("/t/community?shared=1");
}

export async function toggleReaction(form: FormData) {
  const user = await requireUser(["teacher"]);
  const postId = String(form.get("postId") ?? "");
  const kind = form.get("kind") === "save" ? "save" : "like";
  const r = schema.communityReactions;
  const where = and(eq(r.postId, postId), eq(r.userId, user.id), eq(r.kind, kind));
  if (db.select().from(r).where(where).get()) db.delete(r).where(where).run();
  else if (db.select().from(schema.communityPosts).where(and(eq(schema.communityPosts.id, postId), eq(schema.communityPosts.status, "approved"))).get())
    db.insert(r).values({ postId, userId: user.id, kind }).run();
  revalidatePath("/t/community");
}

export async function copyToDrafts(form: FormData) {
  const user = await requireUser(["teacher"]);
  const p = db.select().from(schema.communityPosts).where(and(eq(schema.communityPosts.id, String(form.get("postId") ?? "")), eq(schema.communityPosts.status, "approved"))).get();
  if (!p) return appRedirect("/t/community");
  db.insert(schema.drafts).values({ id: newId(), ownerId: user.id, title: p.title, type: p.kind === "paper" ? "quiz" : p.kind === "tutor" ? "notes" : "worksheet", subject: p.subject, content: p.content }).run();
  return appRedirect("/t/community?copied=1");
}
