import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CommunityKind } from "@/lib/db/schema";

export const COMMUNITY_KINDS: CommunityKind[] = ["worksheet", "paper", "tutor"];

export function listPosts(viewerId: string, f: { subject?: string; kind?: string; status?: "approved" | "pending" | "rejected" } = {}) {
  const p = schema.communityPosts;
  const conds: SQL[] = [eq(p.status, f.status ?? "approved")];
  if (f.subject) conds.push(eq(p.subject, f.subject));
  if (f.kind && (COMMUNITY_KINDS as string[]).includes(f.kind)) conds.push(eq(p.kind, f.kind as CommunityKind));
  const rows = db
    .select({ post: p, authorName: schema.users.displayName, authorAvatar: schema.users.avatar })
    .from(p)
    .leftJoin(schema.users, eq(schema.users.id, p.authorId))
    .where(and(...conds))
    .orderBy(desc(p.createdAt))
    .all();
  const reactions = db.select().from(schema.communityReactions).all();
  return rows.map((r) => {
    const mine = reactions.filter((x) => x.postId === r.post.id);
    return {
      ...r.post,
      authorName: r.authorName ?? "—",
      authorAvatar: r.authorAvatar ?? "🙂",
      likes: mine.filter((x) => x.kind === "like").length,
      saves: mine.filter((x) => x.kind === "save").length,
      liked: mine.some((x) => x.kind === "like" && x.userId === viewerId),
      saved: mine.some((x) => x.kind === "save" && x.userId === viewerId),
    };
  });
}

export function myPendingPosts(userId: string) {
  return db
    .select()
    .from(schema.communityPosts)
    .where(eq(schema.communityPosts.authorId, userId))
    .orderBy(desc(schema.communityPosts.createdAt))
    .all()
    .filter((p) => p.status !== "approved");
}
