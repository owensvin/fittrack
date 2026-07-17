# FitTrack shared food library — worker

A tiny Cloudflare Worker + D1 database that hosts the shared food library.
Free tier limits (100k requests/day, 5 GB D1) are orders of magnitude more
than this app will ever use.

**Deployed and live** at `https://fittrack-foods.owensvin.workers.dev`
(Cloudflare account = the owensvin GitHub login; D1 database `fittrack-foods`,
id in `wrangler.toml`). The app points at it via `SHARED_FOODS_API` in
`js/app.js`.

## Redeploying after a code change

```
npx wrangler deploy
```

from this folder. Deploys propagate over ~30 seconds — requests right after a
deploy can hit a mix of old and new versions, so re-test before debugging odd
results. Schema changes go through
`npx wrangler d1 execute fittrack-foods --remote --file=schema.sql`
(the schema is `CREATE TABLE IF NOT EXISTS`, safe to re-run).

## Recreating from scratch (only if the Cloudflare account/db is ever lost)

1. Create a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. From this folder: `npx wrangler login`, then
   `npx wrangler d1 create fittrack-foods` and paste the printed `database_id`
   into `wrangler.toml`.
3. `npx wrangler d1 execute fittrack-foods --remote --file=schema.sql`, then
   `npx wrangler deploy`. If the deploy asks to register a workers.dev
   subdomain, that's a one-time dashboard step (Workers → onboarding).
4. Put the printed URL into `SHARED_FOODS_API` in `js/app.js` and ship.

## Maintenance

- Browse/fix data anytime: Cloudflare dash → Storage & Databases → D1 →
  fittrack-foods, or `npx wrangler d1 execute fittrack-foods --remote --command "SELECT * FROM foods"`.
- Delete a bad entry: `... --command "DELETE FROM foods WHERE id = 123"`.
- Republishing a food with the same name overwrites the old values, so typos
  in numbers can be fixed from inside the app — and since v3.10.0 the app's
  Shared tab has swipe-to-edit/delete built in, so the commands above are only
  needed as a fallback.
- The library holds real user data — delete test rows by id, never wholesale.
