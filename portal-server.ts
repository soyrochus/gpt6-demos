// Serve only the two portals and their assets, never the repository's source files.
import { resolve } from "node:path";

const root = import.meta.dir;
const assets = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/portal/", "portal/index.html"],
  ["/portal/index.html", "portal/index.html"],
  ["/portal/portal.css", "portal/portal.css"],
  ["/portal/portal.js", "portal/portal.js"],
  ...[
    "edificio-europa.png",
    "infinicave.png",
    "tonada.png",
    "tarot-spread.png",
    "orbital-mechanics.png",
    "digital-logic laboratory.png",
    "flip-slop.png",
    "codexcanvas.png",
    "assemblavatar.png",
    "one-more-match.png",
    "not-a-virus.png",
    "tracework.png",
    "dmt-experience.png",
  ].map((name) => [`/images/${name}`, `images/${name}`]),
]);

const demoCount = 12;
export function validateBasePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535 - demoCount) {
    throw new Error(`Base port must be an integer between 1 and ${65535 - demoCount}`);
  }
  return port;
}

// Keep on-disk links useful at the default ports; rewrite only demo links
// in served HTML so both galleries follow the actual portal port.
async function portalHtml(file: ReturnType<typeof Bun.file>, basePort: number): Promise<Response> {
  const demoUrl = (offset: number) => {
    if (!Number.isInteger(offset) || offset < 1 || offset > demoCount) throw new Error("Invalid demo port offset");
    return `http://localhost:${basePort + offset}/`;
  };
  const html = (await file.text()).replace(
    /(<script id="demo-data" type="application\/json">)([\s\S]*?)(<\/script>)/,
    (_match, start, json, end) => {
      const demos = JSON.parse(json);
      for (const demo of demos) {
        if (demo.portOffset !== undefined) demo.url = demoUrl(demo.portOffset);
      }
      return start + JSON.stringify(demos).replace(/</g, "\\u003c") + end;
    },
  );
  return new HTMLRewriter().on("a[data-port-offset]", {
    element(element) {
      element.setAttribute("href", demoUrl(Number(element.getAttribute("data-port-offset"))));
    },
  }).transform(new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  }));
}

export async function servePortal(request: Request, basePort = Number(process.env.PORT || 3000)): Promise<Response> {
  validateBasePort(basePort);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (pathname === "/portal") {
    return new Response(null, { status: 308, headers: { Location: "/portal/" } });
  }
  const asset = assets.get(pathname);
  if (!asset) return new Response("Not found", { status: 404 });
  const file = Bun.file(resolve(root, asset));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  if (asset.endsWith(".html") && request.method === "GET") return portalHtml(file, basePort);
  return new Response(request.method === "HEAD" ? null : file, {
    headers: { "Content-Type": file.type, "Cache-Control": "no-cache" },
  });
}

if (import.meta.main) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: validateBasePort(Number(process.env.PORT || 3000)),
    fetch: (request, server) => servePortal(request, server.port),
  });
  console.log(`GPT6 Demos portal server listening on port ${server.port}`);
}
