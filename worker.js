export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });

    const text = (t, status = 200) =>
      new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders } });

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

    // --- routes
    if (url.pathname === "/ping") {
      return json({ ok: true, worker: "datahutang", hasKV: !!env.HUTANG_KV, hasAssets: !!env.ASSETS });
    }

    if (url.pathname === "/kv/exists") {
      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);
      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      return json({ success: true, found: !!val, key });
    }

    if (url.pathname === "/kv/public") {
      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      const key = `wa:${wa}`;
      const val = await env.HUTANG_KV.get(key);
      if (!val) return json({ success: true, found: false, key });

      let parsed = null;
      try { parsed = JSON.parse(val); } catch {}

      const safe = parsed && typeof parsed === "object" ? {
        schema: parsed.schema ?? 1,
        updatedAt: parsed.updatedAt ?? null,
        id: parsed.id ?? null,
        nama: String(parsed.nama ?? ""),
        nomor: String(parsed.nomor ?? wa),
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      } : {};

      return json({ success: true, found: true, key, value: safe });
    }

    // PRIVATE endpoints (optional, tetap)
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

    if (url.pathname === "/kv/put") {
      if (!requireAuth()) return json({ success: false, error: "UNAUTHORIZED" }, 401);
      if (request.method !== "PUT" && request.method !== "POST") {
        return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
      }
      const wa = normWA(url.searchParams.get("wa"));
      if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

      let body;
      try { body = await request.json(); } catch {
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

    // --- assets fallback
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    // kalau assets belum kebinding, jangan crash
    return text("Assets binding belum aktif. Pastikan [assets] directory = \"public\" di wrangler.toml dan deploy ulang.", 500);
  },
};
