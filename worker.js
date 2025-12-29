export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== CORS =====
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ===== API ROUTES =====
    if (url.pathname.startsWith("/kv/")) {
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

      // /kv/exists
      if (url.pathname === "/kv/exists") {
        const wa = normWA(url.searchParams.get("wa"));
        if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);
        const val = await env.HUTANG_KV.get(`wa:${wa}`);
        return json({ success: true, found: !!val });
      }

      // /kv/public
      if (url.pathname === "/kv/public") {
        const wa = normWA(url.searchParams.get("wa"));
        if (!wa) return json({ success: false, error: "WA_INVALID" }, 400);

        const raw = await env.HUTANG_KV.get(`wa:${wa}`);
        if (!raw) return json({ success: true, found: false });

        let data;
        try { data = JSON.parse(raw); } catch { data = {}; }

        return json({
          success: true,
          found: true,
          value: {
            nama: data.nama || "",
            nomor: data.nomor || wa,
            updatedAt: data.updatedAt || null,
            transactions: Array.isArray(data.transactions) ? data.transactions : []
          }
        });
      }

      return json({ success: false, error: "NOT_FOUND" }, 404);
    }

    // ===== STATIC ASSETS (PALING AKHIR) =====
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Assets not available", { status: 500 });
  },
};
