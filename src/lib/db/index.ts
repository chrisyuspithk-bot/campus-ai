import "server-only";
import * as schema from "./schema";
import { openDb } from "@/lib/db/driver";

// Reuse the connection across dev hot reloads.
const g = globalThis as unknown as { __campusDb?: ReturnType<typeof openDb> };
export const db = g.__campusDb ?? (g.__campusDb = openDb());
export { schema };
