import "server-only";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";

export type ModelOption = { id: string; displayName: string; description: string; openrouterId: string };

export function modelsFor(role: Role, whitelist: string[] = []): ModelOption[] {
  return db
    .select()
    .from(schema.models)
    .orderBy(asc(schema.models.sortOrder))
    .all()
    .filter((m) => m.enabled && m.roles.includes(role))
    .filter((m) => whitelist.length === 0 || whitelist.includes(m.id))
    .map((m) => ({ id: m.id, displayName: m.displayName, description: m.description, openrouterId: m.openrouterId }));
}

/** Pick the requested model if allowed, else the user's default, else the first allowed. */
export function resolveModel(
  options: ModelOption[],
  requested?: string | null,
  fallback?: string | null,
): ModelOption | null {
  return (
    options.find((m) => m.id === requested) ??
    options.find((m) => m.id === fallback) ??
    options[0] ??
    null
  );
}
