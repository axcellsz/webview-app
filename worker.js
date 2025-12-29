export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== API ONLY =====
    if (url.pathname === "/ping") {
      return new Response(JSON.stringify({
        ok: true,
        kv: !!env.HUTANG_KV
      }), { headers: { "Content-Type": "application/json" }});
    }

    if (url.pathname === "/kv/exists") {
      const wa = url.searchParams.get("wa");
      const val = await env.HUTANG_KV.get(`wa:${wa}`);
      return Response.json({ found: !!val });
    }

    if (url.pathname === "/kv/public") {
      const wa = url.searchParams.get("wa");
      const val = await env.HUTANG_KV.get(`wa:${wa}`);
      if (!val) return Response.json({ found: false });
      return Response.json({ found: true, value: JSON.parse(val) });
    }

    // ⚠️ PENTING:
    // JANGAN RETURN APA-APA DI SINI
    // BIAR WRANGLER HANDLE STATIC ASSETS
    return new Response("Not Found", { status: 404 });
  }
};
