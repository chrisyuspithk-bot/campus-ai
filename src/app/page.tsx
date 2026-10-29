import { appRedirect } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/session";

// "/" → role home (proxy normally handles this; kept as a fallback).
export default async function Root() {
  const user = await getCurrentUser();
  await appRedirect(user ? homeFor(user.role) : "/login");
}
