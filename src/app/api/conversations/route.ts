import { requireApiUser } from "@/lib/auth/dal";
import { listConversations } from "@/lib/conversations";

export async function GET(req: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ conversations: listConversations(user.id, q) });
}
