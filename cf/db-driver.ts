import { drizzle } from "drizzle-orm/durable-sqlite";
import * as schema from "@/lib/db/schema";
import type { openDb as openNodeDb } from "../src/lib/db/driver";

/**
 * Cloudflare replacement for src/lib/db/driver.ts. Durable Object SQLite is synchronous, so the
 * app's `.get()/.all()/.run()` call sites work unchanged. cf/worker.ts publishes the storage.
 */
export function openDb() {
  const g = globalThis as unknown as { __campusDoStorage?: DurableObjectStorage };
  let real: ReturnType<typeof drizzle<typeof schema>> | undefined;
  let boundTo: DurableObjectStorage | undefined;
  return new Proxy({} as object, {
    get(_t, prop) {
      if (!g.__campusDoStorage) throw new Error("Database is only available inside the CampusApp Durable Object");
      // A restarted Durable Object can reuse the isolate with a new storage handle; the old one throws.
      if (!real || boundTo !== g.__campusDoStorage) {
        boundTo = g.__campusDoStorage;
        real = drizzle(boundTo, { schema });
      }
      const value = Reflect.get(real, prop);
      return typeof value === "function" ? value.bind(real) : value;
    },
  }) as ReturnType<typeof openNodeDb>;
}
