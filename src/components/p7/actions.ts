"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { markNoticesRead } from "@/lib/p7/notify";

export async function markNoticesReadAction() {
  const user = await requireUser(["teacher", "admin"]);
  markNoticesRead(user.id);
  revalidatePath("/", "layout");
}
