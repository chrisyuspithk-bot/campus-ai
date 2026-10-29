"use server";
import { eq } from "drizzle-orm";
import { appRedirect } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { newId } from "@/lib/ids";
import { canEditTutor } from "@/lib/tutors";
import { translate } from "@/lib/i18n/dict";

const LEVELS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const STRATEGIES = ["strict", "moderate", "answers"] as const;

export type TutorInput = {
  name: string;
  nameEn: string;
  subject: string;
  emoji: string;
  levels: string[];
  strategy: string;
  tagline: string;
  blurb: string;
  will: string;
  wont: string;
  topics: string;
  systemPrompt: string;
  modelWhitelist: string[];
};

async function editable(id: string) {
  const user = await requireUser(["teacher"]);
  const tutor = db.select().from(schema.tutors).where(eq(schema.tutors.id, id)).get();
  if (!tutor || !canEditTutor(user, tutor)) throw new Error("not_found");
  return { user, tutor };
}

export async function createTutor() {
  const user = await requireUser(["teacher"]);
  const id = newId();
  db.insert(schema.tutors)
    .values({
      id,
      slug: `tutor-${id.slice(0, 8)}`,
      name: translate(user.language, "tt.newName"),
      subject: user.group ?? "",
      levels: LEVELS,
      ownerId: user.id,
      status: "draft",
    })
    .run();
  await appRedirect(`/t/tutors?id=${id}`);
}

export async function saveTutor(id: string, input: TutorInput, status?: "draft" | "published") {
  const { user: me, tutor: before } = await editable(id);
  const allowedModels = new Set(db.select({ id: schema.models.id }).from(schema.models).all().map((m) => m.id));
  db.update(schema.tutors)
    .set({
      name: input.name.trim().slice(0, 60) || "Tutor",
      nameEn: input.nameEn.trim().slice(0, 60),
      subject: input.subject.trim().slice(0, 30),
      emoji: [...input.emoji.trim()].slice(0, 2).join("") || "📘",
      levels: input.levels.filter((l) => LEVELS.includes(l)),
      strategy: (STRATEGIES as readonly string[]).includes(input.strategy) ? (input.strategy as (typeof STRATEGIES)[number]) : "strict",
      tagline: input.tagline.trim().slice(0, 80),
      blurb: input.blurb.trim().slice(0, 1000),
      will: input.will.slice(0, 1000),
      wont: input.wont.slice(0, 1000),
      topics: input.topics.trim().slice(0, 500),
      systemPrompt: input.systemPrompt.slice(0, 6000),
      modelWhitelist: input.modelWhitelist.filter((m) => allowedModels.has(m)),
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.tutors.id, id))
    .run();
  if (status && status !== before.status) audit(me, status === "published" ? "tutor.publish" : "tutor.unpublish", input.name);
  revalidatePath("/t/tutors");
  revalidatePath("/s/tutors");
  return { ok: true };
}

export async function deleteTutor(id: string) {
  const { user: me, tutor } = await editable(id);
  audit(me, "tutor.delete", tutor.name);
  db.delete(schema.tutors).where(eq(schema.tutors.id, id)).run();
  revalidatePath("/t/tutors");
  await appRedirect("/t/tutors");
}
