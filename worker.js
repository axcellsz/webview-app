export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== CORS (untuk endpoint API) =====
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
        headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
      });

    const hasKV = !!env.HUTANG_KV;
    const hasAssets = !!env.ASSETS && typeof env.ASSETS.fetch === "function";

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

    // ===== ROUTE: /ping =====
    if (url.pathname === "/ping") {
      return json({
        ok: true,
        worker: "datahutang",
        time: new Date().toISOString(),
        hasKV,
        hasAssets,
      });
    }

    // ===== API ROUTES =====
    // Semua endpoint API diawali /kv/
    if (url.pathname.startsWith("/kv/")) {
      if (!hasKV) {
        return json(
          { success: false, error: "KV_BINDING_MISSING", hint: "Cek wrangler.toml kv_namespaces binding=HUTANG_KV" },
          500
        );
      }

      // GET /kv/exists?wa=08xxxx  (public)
      if (url.pathname === "/kv/exists") {
        const wa = normWA(url.searchParams.get("wa"));
        if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);
        const key = `wa:${wa}`;
        const val = await env.HUTANG_KV.get(key);
        return json({ success: true, found: !!val, key });
      }

      // GET /kv/public?wa=08xxxx (public)
      if (url.pathname === "/kv/public") {
        const wa = normWA(url.searchParams.get("wa"));
        if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

        const key = `wa:${wa}`;
        const val = await env.HUTANG_KV.get(key);
        if (!val) return json({ success: true, found: false, key });

        let parsed = null;
        try { parsed = JSON.parse(val); } catch {}

        const safe =
          parsed && typeof parsed === "object"
            ? {
                schema: parsed.schema ?? 1,
                updatedAt: parsed.updatedAt ?? null,
                id: parsed.id ?? null,
                nama: String(parsed.nama ?? ""),
                nomor: String(parsed.nomor ?? wa),
                transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
              }
            : null;

        return json({ success: true, found: true, key, value: safe ?? val });
      }

      // PRIVATE: GET /kv/get?wa=08xxxx (auth)
      if (url.pathname === "/kv/get") {
        if (!requireAuth()) return json({ success: false, error: "UNAUTHORIZED" }, 401);
        const wa = normWA(url.searchParams.get("wa"));
        if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

        const key = `wa:${wa}`;
        const val = await env.HUTANG_KV.get(key);
        if (!val) return json({ success: true, found: false, key });

        let parsed = null;
        try { parsed = JSON.parse(val); } catch {}
        return json({ success: true, found: true, key, value: parsed ?? val });
      }

      // PRIVATE: PUT/POST /kv/put?wa=08xxxx (auth)
      if (url.pathname === "/kv/put") {
        if (!requireAuth()) return json({ success: false, error: "UNAUTHORIZED" }, 401);
        if (request.method !== "PUT" && request.method !== "POST") {
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

        const obj = {
          ...(body && typeof body === "object" ? body : {}),
          nomor: wa,
          updatedAt: Date.now(),
          schema: body?.schema ?? 1,
        };

        const key = `wa:${wa}`;
        await env.HUTANG_KV.put(key, JSON.stringify(obj));
        return json({
          success: true,
          key,
          saved: true,
          txCount: Array.isArray(obj.transactions) ? obj.transactions.length : 0,
        });
      }

      return json({ success: false, error: "NOT_FOUND" }, 404);
    }

    // ===== ASSETS =====
    // Kalau bukan /kv/* dan assets ada, serve static (index.html, detail-hutang.html, dll)
    if (hasAssets) {
      return env.ASSETS.fetch(request);
    }

    // fallback kalau assets binding belum aktif
    return text(
      "Assets binding belum aktif.\nPastikan wrangler.toml ada [assets] directory = \"./public\" dan file ada di folder public.\nLalu deploy ulang.",
      500
    );
  },
};
