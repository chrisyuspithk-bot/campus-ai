import fs from "node:fs/promises";
import { requireApiUser } from "@/lib/auth/dal";
import { getOwnPhoto, photoPath } from "@/lib/p7/photo";

/** The student's own question photo (owner only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/practice/photo/[id]/image">) {
  const user = await requireApiUser(["student"]);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const p = getOwnPhoto(id, user.id);
  if (!p?.imageFile) return new Response("not found", { status: 404 });
  try {
    const buf = await fs.readFile(photoPath(p.id));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
