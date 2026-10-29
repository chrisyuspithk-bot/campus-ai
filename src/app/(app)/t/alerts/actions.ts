"use server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";

export async function dismissAlert(form: FormData) {
  const user = await requireUser(["teacher"]);
  const key = String(form.get("key") ?? "").slice(0, 120);
  if (key) db.insert(schema.alertDismissals).values({ teacherId: user.id, key }).onConflictDoNothing().run();
  revalidatePath("/t/alerts");
}
