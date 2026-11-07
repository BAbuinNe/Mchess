import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";

const port = 22000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const adminToken = "test-admin-token-for-mchess-announcements-123456";
await mkdir("data", { recursive: true });
const dataDir = await mkdtemp(join(process.cwd(), "data", "mchess-news-"));
const start = () => spawn(process.execPath, ["apps/server/dist/main.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MCHESS_DATA_DIR: dataDir, MCHESS_ADMIN_TOKEN: adminToken }, stdio: ["ignore", "ignore", "inherit"] });
const waitForServer = async () => {
  for (let i = 0; i < 100; i++) {
    if ((await fetch(base + "/health").catch(() => null))?.ok) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("server did not start");
};
let server = start();
let socket;
try {
  await waitForServer();
  assert.deepEqual(await (await fetch(base + "/api/announcements")).json(), []);
  socket = new WebSocket(base.replace("http", "ws") + "/ws/announcements");
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("announcement was not broadcast")), 5000);
    socket.addEventListener("message", event => { clearTimeout(timeout); resolve(JSON.parse(event.data)); }, { once: true });
  });
  const unauthorized = await fetch(base + "/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Новая версия", body: "Обновите приложение" }) });
  assert.equal(unauthorized.status, 401);
  const created = await fetch(base + "/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ title: "Новая версия", body: "Обновите приложение" }) });
  assert.equal(created.status, 201, created.ok ? "announcement creation failed" : await created.text());
  const item = await created.json();
  assert.equal(item.title, "Новая версия");
  assert.equal((await received).item.id, item.id);
  assert.equal((await (await fetch(base + "/api/announcements")).json())[0].id, item.id);
  socket.close();
  server.kill();
  await new Promise(resolve => server.once("exit", resolve));
  server = start();
  await waitForServer();
  assert.equal((await (await fetch(base + "/api/announcements")).json())[0].id, item.id);
  process.stdout.write("admin auth, broadcast and persisted announcements: OK\n");
} finally { socket?.close(); server.kill(); }
