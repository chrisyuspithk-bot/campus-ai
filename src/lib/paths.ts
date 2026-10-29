import "server-only";
import path from "node:path";

/** SQLite file location. Runtime-configurable, so excluded from build file tracing. */
export const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "campus.db");

/** Uploaded knowledge-base files live next to the database. */
export const UPLOADS_DIR = path.join(/* turbopackIgnore: true */ path.dirname(DB_PATH), "uploads");
