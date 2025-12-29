export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ===== CORS =====
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
      "Access-Control-Max-Age": "86400",
    };

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ===== Helpers =====
    const json = (obj, status = 200, extraHeaders = {}) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
          ...extraHeaders,
        },
      });

    const text = (t, status = 200, extraHeaders = {}) =>
      new Response(t, {
        status,
        headers: { ...corsHeaders, ...extraHeaders },
      });

    const normWA = (wa) => {
      const digits = String(wa || "").replace(/[^\d]/g, "");
      if (!digits.startsWith("08")) return "";
      if (digits.length < 9) return "";
      return digits;
    };

    const requireAuth = () => {
      const key = request.headers.get("X-Sync-Key") || "";
      return key && env.SYNC_KEY && key === env.SYNC_KEY;
    };

    // ===== Routes =====
    // GET /ping  (tanpa auth)
    if (url.pathname === "/ping") {
      return json({
        ok: true,
        worker: "datahutang",
        hasKV: !!env.HUTANG_KV,
        time: new Date().toISOString(),
      });
    }

    // GET /kv/get?wa=08xxxx  (butuh auth)
    if (url.pathname === "/kv/get") {
      if (!requireAuth()) return json({ success: false, error: "UNAUTHORIZED" }, 401);

      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      if (!val) return json({ success: true, found: false, key });

      // val sudah berupa string JSON (dari index)
      let parsed = null;
      try { parsed = JSON.parse(val); } catch {}
      return json({ success: true, found: true, key, value: parsed ?? val });
    }

    // PUT /kv/put?wa=08xxxx  body: JSON user (butuh auth)
    if (url.pathname === "/kv/put") {
      if (!requireAuth()) return json({ success: false, error: "UNAUTHORIZED" }, 401);
      if (request.method !== "PUT" && request.method !== "POST") {
        return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
      }

      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      let bodyText = "";
      try {
        bodyText = await request.text();
      } catch {
        return json({ success: false, error: "BODY_READ_FAIL" }, 400);
      }

      if (!bodyText) return json({ success: false, error: "BODY_EMPTY" }, 400);

      // Validasi JSON
      let obj = null;
      try {
        obj = JSON.parse(bodyText);
      } catch {
        return json({ success: false, error: "BODY_NOT_JSON" }, 400);
      }

      // Paksa nomor sama dengan query (biar rapih)
      obj = {
        ...(obj && typeof obj === "object" ? obj : {}),
        nomor: wa,
        updatedAt: Date.now(),
        schema: obj?.schema ?? 1,
      };

      const key = `wa:${wa}`;

      await env.HUTANG_KV.put(key, JSON.stringify(obj));
      return json({ success: true, key, saved: true, txCount: Array.isArray(obj.transactions) ? obj.transactions.length : 0 });
    }

    // Default root: info (tanpa auth)
    if (url.pathname === "/" || url.pathname === "/") {
      return text(
        `datahutang worker OK\n\nUse:\n- GET  /ping\n- GET  /kv/get?wa=08xxxx   (header: X-Sync-Key)\n- PUT  /kv/put?wa=08xxxx   (header: X-Sync-Key, body JSON)\n`
      );
    }

    return json({ success: false, error: "NOT_FOUND" }, 404);
  },
};
