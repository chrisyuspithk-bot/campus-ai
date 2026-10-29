import { requireApiUser } from "@/lib/auth/dal";
import { getConversation, toUiMessages } from "@/lib/conversations";

export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const found = getConversation(user.id, id);
  if (!found) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ messages: toUiMessages(found.messages) });
}
