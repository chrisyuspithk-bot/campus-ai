"use server";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { featuresFor } from "@/lib/features";
import { audit } from "@/lib/audit";
import { runResearch } from "@/lib/p7/research";

export async function researchAction(form: FormData) {
  const user = await requireUser();
  if (!featuresFor(user.role).web_search) return appRedirect("/research?err=feature_off");
  const q = String(form.get("q") ?? "");
  const r = await runResearch(user, q);
  if (!r.ok) return appRedirect(`/research?err=${r.error}`);
  audit(user, "research.run", q.slice(0, 80), r.conversationId);
  return appRedirect(`/research?c=${r.conversationId}`);
}
