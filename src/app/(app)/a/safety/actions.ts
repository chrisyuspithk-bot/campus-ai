"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";

const STATUS = { resolve: "resolved", escalate: "escalated", reopen: "open" } as const;

export async function handleCase(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = String(form.get("id") ?? "");
  const op = String(form.get("op")) as keyof typeof STATUS;
  if (!(op in STATUS)) return;
  const c = db.select().from(schema.safetyCases).where(eq(schema.safetyCases.id, id)).get();
  if (!c) return;
  const note = String(form.get("note") ?? "").slice(0, 1000);
  db.update(schema.safetyCases)
    .set({ status: STATUS[op], note, handledBy: me.displayName, handledAt: new Date() })
    .where(eq(schema.safetyCases.id, id))
    .run();
  audit(me, `safety.${op}`, `${c.category}/${c.level}`, note);
  revalidatePath("/a/safety");
}
