import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const root = resolve("apps/web/dist");
const upstream = "https://melchess.vercel.app";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".wasm": "application/wasm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg" };

async function proxy(req, res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) { res.writeHead(413); res.end(); return; }
    chunks.push(chunk);
  }
  try {
    const target = new URL(req.url, upstream);
    const headers = {};
    for (const name of ["authorization", "content-type"]) if (req.headers[name]) headers[name] = req.headers[name];
    const response = await fetch(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store" });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("API proxy error", error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream_unavailable" }));
  }
}

createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/")) { await proxy(req, res); return; }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  let file;
  try { file = resolve(root, "." + decodeURIComponent(pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) { file = join(file, "index.html"); info = await stat(file).catch(() => null); }
  if (!info?.isFile()) { file = join(root, "index.html"); info = await stat(file).catch(() => null); }
  if (!info?.isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "content-length": info.size, "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600" });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT || 10000), "0.0.0.0", () => console.log("MChess gateway ready"));

