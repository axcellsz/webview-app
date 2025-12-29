export default {
  async fetch() {
    return new Response("hallo", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
