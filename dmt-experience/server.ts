const page = Bun.file(new URL("./index.html", import.meta.url));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3012),
  routes: {
    "/": { GET: () => new Response(page) },
    "/index.html": { GET: () => new Response(page) },
  },
  fetch: () => new Response("Not found", { status: 404 }),
});
console.log(`Elfspace: ${server.url}`);
