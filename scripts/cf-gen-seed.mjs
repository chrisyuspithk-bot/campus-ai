/* Dumps a freshly seeded SQLite file to cf/seed.generated.json. Usage: node scripts/cf-gen-seed.mjs <db-path> */
import Database from "better-sqlite3";
import fs from "node:fs";

const sqlite = new Database(process.argv[2], { readonly: true });
const objects = sqlite
  .prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'table' DESC")
  .all();
const tables = objects
  .filter((o) => o.type === "table")
  .map(({ name }) => {
    const stmt = sqlite.prepare(`SELECT * FROM "${name}"`).raw();
    return { name, columns: stmt.columns().map((c) => c.name), rows: stmt.all() };
  });
fs.writeFileSync("cf/seed.generated.json", JSON.stringify({ schema: objects.map((o) => o.sql), tables }));
console.log(`Seed: ${tables.length} tables, ${tables.reduce((n, t) => n + t.rows.length, 0)} rows`);
