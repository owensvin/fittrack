# FitTrack shared food library — deploy guide

A tiny Cloudflare Worker + D1 database that hosts the shared food library.
Free tier limits (100k requests/day, 5 GB D1) are orders of magnitude more
than this app will ever use.

## One-time setup (~5 minutes)

1. Create a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. In a terminal, from this `worker/` folder:

   ```
   npx wrangler login          # opens the browser for a one-click authorize
   npx wrangler d1 create fittrack-foods
   ```

   The create command prints a `database_id` — paste it into `wrangler.toml`
   (replacing `REPLACE_ME`).

3. Create the table and deploy:

   ```
   npx wrangler d1 execute fittrack-foods --remote --file=schema.sql
   npx wrangler deploy
   ```

   Deploy prints the worker URL, e.g. `https://fittrack-foods.<your-subdomain>.workers.dev`.

4. Put that URL into `SHARED_FOODS_API` at the top of `js/app.js` (no trailing
   slash) and ship a new app version. Done — the Shared tab appears in the
   food sheet for everyone on that build.

## Maintenance

- Browse/fix data anytime: Cloudflare dash → Storage & Databases → D1 →
  fittrack-foods, or `npx wrangler d1 execute fittrack-foods --remote --command "SELECT * FROM foods"`.
- Delete a bad entry: `... --command "DELETE FROM foods WHERE id = 123"`.
- Republishing a food with the same name overwrites the old values, so typos
  in numbers can be fixed from inside the app.
