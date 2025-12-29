export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* =========================
       CORS
    ========================= */
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      });

    const normWA = (wa) => {
      const d = String(wa || "").replace(/[^\d]/g, "");
      if (!d.startsWith("08")) return "";
      if (d.length < 9) return "";
      return d;
    };

    const requireAuth = () => {
      const key = request.headers.get("X-Sync-Key");
      return key && env.SYNC_KEY && key === env.SYNC_KEY;
    };

    /* =========================
       API ROUTES
    ========================= */

    // GET /ping
    if (url.pathname === "/ping") {
      return json({
        ok: true,
        worker: "datahutang",
        hasKV: !!env.HUTANG_KV,
        time: new Date().toISOString(),
      });
    }

    // GET /kv/get?wa=08xxx
    if (url.pathname === "/kv/get") {
      if (!requireAuth())
        return json({ success: false, error: "UNAUTHORIZED" }, 401);

      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      if (!val) return json({ success: true, found: false, key });

      let parsed;
      try { parsed = JSON.parse(val); } catch {}
      return json({ success: true, found: true, key, value: parsed ?? val });
    }

    // PUT /kv/put?wa=08xxx
    if (url.pathname === "/kv/put") {
      if (!requireAuth())
        return json({ success: false, error: "UNAUTHORIZED" }, 401);

      if (!["PUT", "POST"].includes(request.method)) {
        return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
      }

      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: "BODY_NOT_JSON" }, 400);
      }

      const payload = {
        ...(body && typeof body === "object" ? body : {}),
        nomor: wa,
        updatedAt: Date.now(),
        schema: body?.schema ?? 1,
      };

      const key = `wa:${wa}`;
      await env.HUTANG_KV.put(key, JSON.stringify(payload));

      return json({
        success: true,
        key,
        saved: true,
        txCount: Array.isArray(payload.transactions)
          ? payload.transactions.length
          : 0,
      });
    }

    /* =========================
       STATIC ASSETS (index.html)
    ========================= */

    // SEMUA selain API → asset
    return env.ASSETS.fetch(request);
  },
};
