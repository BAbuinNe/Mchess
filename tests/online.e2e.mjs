import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";

const port = 22000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
await mkdir("data", { recursive: true });
const dataDir = await mkdtemp(join(process.cwd(), "data", "online-test-"));
const server = spawn(process.execPath, ["apps/server/dist/main.js"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), MCHESS_DATA_DIR: dataDir, MCHESS_MATCH_TIMEOUT_MS: "150" }, stdio: "ignore"
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = async (path, options = {}) => {
  const response = await fetch(base + path, options);
  return { status: response.status, body: await response.json() };
};
const auth = token => ({ Authorization: `Bearer ${token}` });
const waitFor = async (condition, label) => {
  for (let i = 0; i < 250; i++) {
    if (await condition()) return;
    await pause(20);
  }
  throw new Error(`Timed out: ${label}`);
};

try {
  await waitFor(async () => (await fetch(base + "/health").catch(() => null))?.ok, "server health");
  const createGuest = async (name, level) => {
    const response = await request("/api/guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, level }) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };
  const alice = await createGuest("Алиса", "amateur");
  const far = await createGuest("Опытный", "experienced");
  const bob = await createGuest("Борис", "amateur");
  const aliceTicket = (await request("/api/matchmaking", { method: "POST", headers: auth(alice.token) })).body;
  assert.equal(aliceTicket.status, "waiting");
  const farTicket = (await request("/api/matchmaking", { method: "POST", headers: auth(far.token) })).body;
  assert.equal(farTicket.status, "waiting");
  const bobTicket = (await request("/api/matchmaking", { method: "POST", headers: auth(bob.token) })).body;
  assert.equal(bobTicket.status, "matched");
  const aliceMatch = (await request(`/api/matchmaking/${aliceTicket.ticketId}`, { headers: auth(alice.token) })).body;
  assert.equal(aliceMatch.status, "matched");
  assert.equal(aliceMatch.session.roomId, bobTicket.session.roomId);
  assert.equal(aliceMatch.state.whitePlayer.name, "Алиса");
  assert.equal(aliceMatch.state.blackPlayer.name, "Борис");
  assert.equal(aliceMatch.state.rated, true);

  const states = [null, null];
  const sockets = [aliceMatch.session, bobTicket.session].map((session, index) => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/ws/rooms/${session.roomId}?token=${session.seatToken}`);
    socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (message.type === "state") states[index] = message; });
    return socket;
  });
  try {
    await waitFor(() => states.every(Boolean), "websocket initial state");
    sockets[0].send(JSON.stringify({ type: "move", from: "e2", to: "e4", clientMoveId: "first" }));
    await waitFor(() => states.every(state => state?.moves.length === 1), "move broadcast");
    sockets[1].send(JSON.stringify({ type: "resign" }));
    await waitFor(() => states.every(state => state?.result === "1-0"), "result broadcast");
  } finally { sockets.forEach(socket => socket.close()); }
  const aliceProfile = (await request("/api/me", { headers: auth(alice.token) })).body;
  const bobProfile = (await request("/api/me", { headers: auth(bob.token) })).body;
  assert.equal(aliceProfile.ratedGames, 1);
  assert.equal(bobProfile.ratedGames, 1);
  assert.equal(aliceProfile.gamesToLeaderboard, 9);
  assert.ok(aliceProfile.rating > 1000 && bobProfile.rating < 1000);
  assert.deepEqual((await request("/api/leaderboard")).body, []);
  await pause(170);
  const farResult = (await request(`/api/matchmaking/${farTicket.ticketId}`, { headers: auth(far.token) })).body;
  assert.equal(farResult.status, "bot");
  assert.equal((await request("/api/me", { headers: auth(far.token) })).body.ratedGames, 0);
  process.stdout.write("guest rating, ±200 matchmaking, WebSocket game and bot timeout: OK\n");
} finally { server.kill(); }
