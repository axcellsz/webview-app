import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });

    // ===== API =====
    if (url.pathname === "/ping") {
      return json({
        ok: true,
        kv: !!env.HUTANG_KV,
        assets: "kv-asset-handler",
      });
    }

    if (url.pathname === "/kv/exists") {
      const wa = url.searchParams.get("wa");
      const val = await env.HUTANG_KV.get(`wa:${wa}`);
      return json({ found: !!val });
    }

    if (url.pathname === "/kv/public") {
      const wa = url.searchParams.get("wa");
      const val = await env.HUTANG_KV.get(`wa:${wa}`);
      if (!val) return json({ found: false });
      return json({ found: true, value: JSON.parse(val) });
    }

    // ===== STATIC FILES =====
    try {
      return await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: JSON.parse(env.__STATIC_CONTENT_MANIFEST),
        }
      );
    } catch (e) {
      return new Response("404 Not Found", { status: 404 });
    }
  },
};
