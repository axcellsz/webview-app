export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== Helpers =====
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
      "Access-Control-Max-Age": "86400",
    };

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      });

    const text = (t, status = 200) =>
      new Response(t, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
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

    // ===== Preflight (CORS) untuk endpoint API =====
    // (biar assets/html gak ikut-ikutan aneh)
    if (request.method === "OPTIONS" && url.pathname.startsWith("/kv/")) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ===== Routes API =====
    if (url.pathname === "/ping") {
      return json({
        ok: true,
        worker: "datahutang",
        hasKV: !!env.HUTANG_KV,
        hasAssets: !!env.ASSETS,
        time: new Date().toISOString(),
      });
    }

    // GET /kv/exists?wa=08xxxx  (public)
    if (url.pathname === "/kv/exists") {
      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      return json({ success: true, found: !!val, key });
    }

    // GET /kv/public?wa=08xxxx (public safe fields)
    if (url.pathname === "/kv/public") {
      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      if (!val) return json({ success: true, found: false, key });

      let parsed = null;
      try {
        parsed = JSON.parse(val);
      } catch {}

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
          : {};

      return json({ success: true, found: true, key, value: safe });
    }

    // PRIVATE endpoints (auth)
    if (url.pathname === "/kv/get") {
      if (!requireAuth()) return json({ success: false, error: "UNAUTHORIZED" }, 401);

      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      if (!val) return json({ success: true, found: false, key });

      let parsed = null;
      try {
        parsed = JSON.parse(val);
      } catch {}

      return json({ success: true, found: true, key, value: parsed ?? val });
    }

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
      return json({ success: true, key, saved: true });
    }

    // ===== Static Assets fallback =====
    // Semua request selain /kv/* dan /ping akan dilayani dari public/
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    // Kalau assets bener-bener ga kebinding (harusnya nggak terjadi kalau toml benar)
    return text(
      'Assets not available. Pastikan wrangler.toml punya:\n\n[assets]\nbinding = "ASSETS"\ndirectory = "public"\n\nDan folder "public/" berisi index.html dll. Lalu deploy ulang.',
      500
    );
  },
};
