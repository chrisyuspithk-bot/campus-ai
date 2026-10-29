import fs from "node:fs/promises";
import path from "node:path";
import { requireApiUser } from "@/lib/auth/dal";
import { getLibraryItem, libraryFileDir } from "@/lib/library";

/** Download / preview an uploaded file. Owner only; HTML is never served as HTML. */
export async function GET(req: Request, ctx: RouteContext<"/api/library/[id]/file">) {
  const user = await requireApiUser(["student", "teacher"]);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const item = getLibraryItem(user.id, id);
  if (!item || item.kind !== "upload") return Response.json({ error: "not_found" }, { status: 404 });
  const buf = await fs.readFile(path.join(libraryFileDir(user.id), item.id)).catch(() => null);
  if (!buf) return Response.json({ error: "missing" }, { status: 404 });
  const inline = new URL(req.url).searchParams.get("inline") === "1" && /^(image\/|application\/pdf|text\/plain)/.test(item.mime ?? "");
  const name = encodeURIComponent(item.filename ?? item.title);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": item.mime ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
