import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import type { Quiz } from "@/lib/studio/types";
import { addWrong } from "@/lib/p4/wrongbook";

/** Studio / self-practice quiz → wrongbook. Body: { libraryId, wrong: [questionIndex, …], picks: { [index]: optionIndex } }. */
export async function POST(req: Request) {
  const user = await requireApiUser(["student"]);
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as { libraryId?: string; wrong?: number[]; picks?: Record<string, number> };
  const item = db.select().from(schema.libraryItems).where(and(eq(schema.libraryItems.id, String(body.libraryId ?? "")), eq(schema.libraryItems.ownerId, user.id))).get();
  if (!item || item.kind !== "quiz") return Response.json({ error: "not_found" }, { status: 404 });
  const quiz = item.data as Quiz;
  const idx = [...new Set((body.wrong ?? []).filter((n) => Number.isInteger(n) && quiz.questions[n]))].slice(0, 50);
  // Self-practice titles look like "練習：數學 · 因式分解".
  const m = item.title.match(/^練習：(\S+)(?: · (.+))?$/);
  const added = addWrong(
    user.id,
    idx.map((n) => {
      const q = quiz.questions[n];
      return { source: "practice" as const, subject: m?.[1] ?? "", topic: m?.[2] ?? item.title, type: "mc" as const, stem: q.q, options: q.options, answer: String(q.answer), myAnswer: body.picks?.[n] != null ? String(body.picks[n]) : "" };
    }),
  );
  return Response.json({ added });
}
