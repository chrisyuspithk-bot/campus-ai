import "server-only";
import type { Role } from "@/lib/db/schema";
import { getSetting, setSetting } from "@/lib/settings";

/** /a/org permission matrix. Capabilities × roles; admins always have everything. */
export const PERMS = [
  "ai.chat",
  "tutor.build",
  "practice.adaptive",
  "create.sandbox",
  "community.share",
  "apps.publish",
  "media.create",
  "videos.watch",
  "data.school",
] as const;
export type Perm = (typeof PERMS)[number];
export type PermMatrix = Record<Perm, Role[]>;

export const PERM_DEFAULTS: PermMatrix = {
  "ai.chat": ["student", "teacher", "admin"],
  "tutor.build": ["teacher", "admin"],
  "practice.adaptive": ["student", "admin"],
  "create.sandbox": ["student", "admin"],
  "community.share": ["teacher", "admin"],
  "apps.publish": ["teacher", "admin"],
  "media.create": ["teacher", "admin"],
  "videos.watch": ["student", "teacher", "admin"],
  "data.school": ["admin"],
};
/** Rows an admin can't switch off for admins / that only make sense for some roles. */
export const PERM_ROLES: Record<Perm, Role[]> = {
  "ai.chat": ["student", "teacher"],
  "tutor.build": ["teacher"],
  "practice.adaptive": ["student"],
  "create.sandbox": ["student"],
  "community.share": ["teacher"],
  "apps.publish": ["teacher"],
  "media.create": ["teacher"],
  "videos.watch": ["student", "teacher"],
  "data.school": ["teacher"],
};

export function permMatrix(): PermMatrix {
  let saved: Partial<PermMatrix> = {};
  try {
    saved = JSON.parse(getSetting("orgPermissions") || "{}");
  } catch {}
  const out = { ...PERM_DEFAULTS };
  for (const p of PERMS) if (Array.isArray(saved[p])) out[p] = Array.from(new Set<Role>(["admin", ...saved[p]!]));
  return out;
}

export function savePermMatrix(m: PermMatrix) {
  setSetting("orgPermissions", JSON.stringify(m));
}

/** Enforced for the P6 capabilities (apps.publish, media.create, practice.adaptive, create.sandbox). */
export function orgCan(role: Role, perm: Perm) {
  return role === "admin" || permMatrix()[perm].includes(role);
}
