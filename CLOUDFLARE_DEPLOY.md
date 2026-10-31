# Cloudflare deployment

Public URL: https://campus-ai.securepro-hk.workers.dev/campus-ai/login (`/` redirects there; the app stays under basePath `/campus-ai`).

Demo logins use the seeded password `demo1234`: `s123`, `t09`, `admin`. They are public, including the admin account.

## Redeploy

```bash
export CLOUDFLARE_API_TOKEN="$(cat ~/.cf_api_token)"
scripts/cf-deploy.sh
node scripts/cf-smoke.mjs   # live check: logins, main pages, chat, persistence
```

The script builds in a clean copy (`~/campus-ai-cf-build`, override with `CF_BUILD_DIR`), so `.env.local` and `data/` cannot reach the bundle and the VPS `.next` is untouched. Allow about 1.5 GB of free disk; delete the copy afterwards if space is tight.

`AUTH_SECRET` is a Cloudflare secret, kept across deploys. Set it once on a new Worker:

```bash
openssl rand -hex 32 | npx wrangler secret put AUTH_SECRET
```

## How it works

- `CAMPUS_TARGET=cloudflare` makes `next.config.ts` swap `src/lib/db/driver.ts` for `cf/db-driver.ts` and stub the native `sharp` and `@napi-rs/canvas`. Without it, the VPS path is the usual `better-sqlite3` build.
- The whole Next app runs inside one SQLite-backed Durable Object (`cf/worker.ts`). Its SQL API is synchronous, so the app's `.get()/.all()/.run()` calls work unchanged. D1 is async and would need every call site rewritten.
- On first boot, an instance loads `cf/seed.generated.json`, generated from `scripts/seed.ts` at build time.

## Data

- Data persists in the Durable Object named by `DB_INSTANCE` in `wrangler.jsonc`.
- There are no migrations on Cloudflare. After a schema change, bump `DB_INSTANCE`: this starts from a fresh seed and **abandons all data in the old instance**.

## Known gaps compared with the VPS

| Area | Behaviour on Cloudflare |
| --- | --- |
| AI | Mock replies until a key is set: `npx wrangler secret put OPENROUTER_API_KEY`. The URL and logins are public, so anyone could spend that key. |
| Uploaded files | Stored in the Worker's temporary filesystem and lost on restart (the file URL returns 404). Extracted text and metadata stay in the database. R2 is not enabled on this account. |
| Seeded scan images | Not deployed, because they live under `data/uploads`. |
| Photo practice, scan upload | Need `sharp` / `@napi-rs/canvas`, which are stubbed. Photo uploads return `unreadable`; typed photo-practice input does not use them. |
| Concurrency | One Durable Object in one location serves every request. Fine for a demo, not for school-wide load. |

Durable Object logs did not appear in `wrangler tail` during setup; don't treat an empty tail as proof that nothing failed.
