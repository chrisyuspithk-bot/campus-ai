"use server";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { getOwnPhoto, photoToWrongbook } from "@/lib/p7/photo";

export async function addPhotoToWrongbook(form: FormData) {
  const user = await requireUser(["student"]);
  const p = getOwnPhoto(String(form.get("id") ?? ""), user.id);
  if (!p) throw new Error("not_found");
  photoToWrongbook(p);
  return appRedirect("/s/practice/photo?added=1");
}
