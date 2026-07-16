// FitTrack shared food library — Cloudflare Worker + D1.
// API (JSON, CORS open — the app ships in a public repo so a baked-in key
// would be public anyway; abuse is bounded by validation + the row cap):
//   GET  /foods          -> { foods: [{id, name, serving, kcal, p, c, f, by, created}] }
//   POST /foods {name, serving, kcal, p, c, f, by}
//        -> { ok: true }  (same name, case-insensitive, replaces the old entry)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const MAX_FOODS = 5000;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (url.pathname !== "/foods") return json({ error: "not found" }, 404);

    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        'SELECT id, name, serving, kcal, p, c, f, added_by AS "by", created FROM foods ORDER BY created DESC, id DESC LIMIT 1000'
      ).all();
      return json({ foods: results });
    }

    if (req.method === "POST") {
      let b;
      try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const name = String(b.name || "").trim().slice(0, 60);
      const serving = String(b.serving || "").trim().slice(0, 40) || "100 g";
      const by = String(b.by || "").trim().slice(0, 20);
      const num = (v, max) => { const n = +v; return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null; };
      const kcal = num(b.kcal, 5000), p = num(b.p, 1000), c = num(b.c, 1000), f = num(b.f, 1000);
      if (!name || kcal === null || p === null || c === null || f === null) return json({ error: "invalid food data" }, 400);

      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM foods").first();
      if (row.n >= MAX_FOODS) return json({ error: "shared library is full" }, 507);

      await env.DB.prepare(
        `INSERT INTO foods (name, name_lc, serving, kcal, p, c, f, added_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(name_lc) DO UPDATE SET name = ?1, serving = ?3, kcal = ?4, p = ?5, c = ?6, f = ?7, added_by = ?8, created = datetime('now')`
      ).bind(name, name.toLowerCase(), serving, kcal, p, c, f, by).run();
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  },
};
