import { randomUUID } from "node:crypto";

export function newId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}
