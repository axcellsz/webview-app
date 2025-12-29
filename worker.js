export default {
  async fetch(request, env, ctx) {
    return new Response("Hallo 👋 Worker berhasil deploy!", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  },
};
