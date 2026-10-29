import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { DB_PATH } from "@/lib/paths";

const dbPath = DB_PATH;

function open() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Reuse the connection across dev hot reloads.
const g = globalThis as unknown as { __campusDb?: ReturnType<typeof open> };
export const db = g.__campusDb ?? (g.__campusDb = open());
export { schema };
