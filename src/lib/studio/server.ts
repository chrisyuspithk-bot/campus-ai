import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { requireApiUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import type { AiError } from "@/lib/ai/run";

/** Student or teacher with the studio feature on. */
export async function studioUser(): Promise<CurrentUser | Response> {
  const user = await requireApiUser(["student", "teacher"]);
  if (user instanceof Response) return user;
  if (!featuresFor(user.role).studio) return Response.json({ error: "feature_off" }, { status: 403 });
  return user;
}

export function aiFail(error: AiError, message?: string) {
  const status = error === "exam_locked" ? 423 : error === "quota" ? 429 : error === "blocked" ? 422 : error === "no_model" ? 403 : 502;
  return Response.json({ error, message }, { status });
}

export function studioBase(user: CurrentUser) {
  return user.role === "teacher" ? "/t/studio" : "/s/studio";
}

export function ownStudioItem(userId: string, id: string) {
  return db
    .select()
    .from(schema.libraryItems)
    .where(and(eq(schema.libraryItems.id, id), eq(schema.libraryItems.ownerId, userId), eq(schema.libraryItems.source, "studio")))
    .get();
}
