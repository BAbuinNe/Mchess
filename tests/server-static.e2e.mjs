import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 22000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), "mchess-static-"));
const server = spawn(process.execPath, ["apps/server/dist/main.js"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), MCHESS_DATA_DIR: dataDir }, stdio: "ignore"
});
try {
  let health;
  for (let i = 0; i < 100; i++) {
    health = await fetch(base + "/health").catch(() => null);
    if (health?.ok) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(health?.status, 200, "server did not start");
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /MChess/);
  const admin = await fetch(base + "/admin");
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /MChess/);
  const portrait = await fetch(base + "/assets/coaches/mellstroy-portrait.png");
  assert.equal(portrait.status, 200);
  assert.match(portrait.headers.get("content-type") || "", /image\/png/);
  process.stdout.write("same-origin website, portrait and API: OK\n");
} finally {
  server.kill();
}
