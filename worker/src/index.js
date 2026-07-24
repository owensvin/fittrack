// FitTrack shared food library — Cloudflare Worker + D1.
//
// Reading is open to anyone; every write needs the library key (set once via
// `wrangler secret put LIBRARY_KEY`, handed to friends out-of-band and pasted
// into the app's Settings — it is deliberately NOT in this public repo).
// On top of that, a row can only be changed by the install that published it.
//
//   GET    /foods            -> { foods: [{id, name, serving, kcal, p, c, f, by, owner, created}] }
//   POST   /foods            -> { ok: true }            [key]
//          {name, serving, kcal, p, c, f, by [, id]}    (id = edit that row in place)
//   DELETE /foods/:id        -> { ok: true }            [key + owner]
//   GET    /export           -> { foods: [...] }        [key]  manual backup pull
//
// Auth headers: X-FitTrack-Key (the library key), X-FitTrack-Owner (opaque
// per-install id). A daily cron snapshots the table into `backups`.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-FitTrack-Key, X-FitTrack-Owner",
};
const MAX_FOODS = 5000;
const KEEP_BACKUPS = 14;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
// Constant-time-ish compare so a wrong key can't be recovered by timing.
function keyOk(req, env) {
  const got = req.headers.get("X-FitTrack-Key") || "";
  const want = env.LIBRARY_KEY || "";
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
function ownerOf(req) { return (req.headers.get("X-FitTrack-Owner") || "").slice(0, 40); }
// A row with no owner predates ownership tracking — any key holder may adopt it.
function mayEdit(row, owner) { return !row.owner || row.owner === owner; }

async function snapshot(env) {
  const { results } = await env.DB.prepare("SELECT * FROM foods ORDER BY id").all();
  await env.DB.prepare("INSERT INTO backups (rows, data) VALUES (?1, ?2)")
    .bind(results.length, JSON.stringify(results)).run();
  await env.DB.prepare(
    "DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT ?1)"
  ).bind(KEEP_BACKUPS).run();
  return results.length;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(snapshot(env));
  },

  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const idMatch = url.pathname.match(/^\/foods\/(\d+)$/);

    if (req.method === "GET" && url.pathname === "/export") {
      if (!keyOk(req, env)) return json({ error: "library key required" }, 401);
      const { results } = await env.DB.prepare("SELECT * FROM foods ORDER BY id").all();
      return json({ foods: results, exported: new Date().toISOString() });
    }

    if (req.method === "DELETE" && idMatch) {
      if (!keyOk(req, env)) return json({ error: "library key required" }, 401);
      const row = await env.DB.prepare("SELECT owner FROM foods WHERE id = ?1").bind(+idMatch[1]).first();
      if (!row) return json({ error: "not found" }, 404);
      if (!mayEdit(row, ownerOf(req))) return json({ error: "that food was added by someone else" }, 403);
      await env.DB.prepare("DELETE FROM foods WHERE id = ?1").bind(+idMatch[1]).run();
      return json({ ok: true });
    }

    if (url.pathname !== "/foods") return json({ error: "not found" }, 404);

    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        'SELECT id, name, serving, kcal, p, c, f, added_by AS "by", owner, created FROM foods ORDER BY created DESC, id DESC LIMIT 1000'
      ).all();
      return json({ foods: results });
    }

    if (req.method === "POST") {
      if (!keyOk(req, env)) return json({ error: "library key required" }, 401);
      const owner = ownerOf(req);
      let b;
      try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const name = String(b.name || "").trim().slice(0, 60);
      const serving = String(b.serving || "").trim().slice(0, 40) || "100 g";
      const by = String(b.by || "").trim().slice(0, 20);
      const num = (v, max) => { const n = +v; return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null; };
      const kcal = num(b.kcal, 5000), p = num(b.p, 1000), c = num(b.c, 1000), f = num(b.f, 1000);
      if (!name || kcal === null || p === null || c === null || f === null) return json({ error: "invalid food data" }, 400);

      if (Number.isInteger(b.id)) {
        // Edit an existing row in place (rename-safe, unlike the name upsert).
        const row = await env.DB.prepare("SELECT owner FROM foods WHERE id = ?1").bind(b.id).first();
        if (!row) return json({ error: "not found" }, 404);
        if (!mayEdit(row, owner)) return json({ error: "that food was added by someone else" }, 403);
        try {
          await env.DB.prepare(
            "UPDATE foods SET name = ?1, name_lc = ?2, serving = ?3, kcal = ?4, p = ?5, c = ?6, f = ?7, added_by = ?8, owner = ?9 WHERE id = ?10"
          ).bind(name, name.toLowerCase(), serving, kcal, p, c, f, by, owner, b.id).run();
          return json({ ok: true });
        } catch (e) {
          return json({ error: "a food with that name already exists" }, 409);
        }
      }

      // New publish. An existing row with the same name is overwritten only if
      // this install owns it (or nobody does) — otherwise it'd be a backdoor
      // around the ownership check above.
      const clash = await env.DB.prepare("SELECT owner FROM foods WHERE name_lc = ?1").bind(name.toLowerCase()).first();
      if (clash && !mayEdit(clash, owner)) return json({ error: "someone else already shared a food with that name" }, 409);
      if (!clash) {
        const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM foods").first();
        if (row.n >= MAX_FOODS) return json({ error: "shared library is full" }, 507);
      }

      await env.DB.prepare(
        `INSERT INTO foods (name, name_lc, serving, kcal, p, c, f, added_by, owner) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(name_lc) DO UPDATE SET name = ?1, serving = ?3, kcal = ?4, p = ?5, c = ?6, f = ?7, added_by = ?8, owner = ?9, created = datetime('now')`
      ).bind(name, name.toLowerCase(), serving, kcal, p, c, f, by, owner).run();
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  },
};
