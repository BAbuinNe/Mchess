import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { Chess } from "chess.js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Seat = "w" | "b";
type Level = "beginner" | "amateur" | "experienced" | "professional";
type Avatar = "knight" | "queen" | "rook" | "bishop" | "king";
type Guest = { id: string; token: string; name: string; level: Level; avatar: Avatar; rating: number; ratedGames: number; wins: number; losses: number; draws: number; ratedRoomIds: string[] };
type MatchTicket = { id: string; guestId: string; joinedAt: number; status: "waiting" | "matched" | "bot"; session?: { roomId: string; seat: Seat; seatToken: string } };
type Announcement = { id: string; title: string; body: string; createdAt: number };
type ClientMessage = { type: "move"; from: string; to: string; promotion?: string; clientMoveId?: string } | { type: "resign" | "offer_draw" | "accept_draw" | "decline_draw" };
type Room = {
  id: string;
  chess: Chess;
  seats: Partial<Record<Seat, string>>;
  sockets: Partial<Record<Seat, Set<{ send: (data: string) => void; readyState: number }>>>;
  createdAt: number;
  resignedBy?: Seat;
  flagged?: Seat;
  drawOfferedBy?: Seat;
  drawAgreed?: boolean;
  clocks: Record<Seat, number>;
  turnStartedAt?: number;
  incrementMs: number;
  seenMoveIds: Set<string>;
  guestIds?: Partial<Record<Seat, string>>;
  rated?: boolean;
  ratingApplied?: boolean;
};

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);

const rooms = new Map<string, Room>();
const guests = new Map<string, Guest>();
const tickets = new Map<string, MatchTicket>();
const announcementSockets = new Set<{ send: (data: string) => void; readyState: number }>();
const dataDir = process.env.MCHESS_DATA_DIR || join(process.cwd(), "data");
const dataFile = join(dataDir, "rooms.json");
const guestFile = join(dataDir, "guests.json");
const announcementFile = join(dataDir, "announcements.json");
mkdirSync(dataDir, { recursive: true });
let announcements: Announcement[] = [];
if (existsSync(announcementFile)) {
  try {
    const saved = JSON.parse(readFileSync(announcementFile, "utf8")) as Announcement[];
    if (Array.isArray(saved)) announcements = saved.filter(item => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.body === "string").slice(-100);
  } catch (error) { app.log.error({ error }, "Could not restore announcements"); }
}
if (existsSync(guestFile)) {
  try {
    for (const guest of JSON.parse(readFileSync(guestFile, "utf8")) as Guest[]) guests.set(guest.id, guest);
  } catch (error) { app.log.error({ error }, "Could not restore guests"); }
}
if (existsSync(dataFile)) {
  try {
    const saved = JSON.parse(readFileSync(dataFile, "utf8")) as Array<{
      id: string; pgn: string; seats: Room["seats"]; createdAt: number;
      resignedBy?: Seat; flagged?: Seat; drawOfferedBy?: Seat; drawAgreed?: boolean;
      clocks: Record<Seat, number>; turnStartedAt?: number; incrementMs: number;
      guestIds?: Partial<Record<Seat, string>>; rated?: boolean; ratingApplied?: boolean;
    }>;
    for (const item of saved) {
      const chess = new Chess();
      if (item.pgn) chess.loadPgn(item.pgn);
      rooms.set(item.id, { ...item, chess, sockets: {}, seenMoveIds: new Set() });
    }
  } catch (error) { app.log.error({ error }, "Could not restore rooms"); }
}

function saveGuests() {
  const pending = guestFile + ".tmp";
  writeFileSync(pending, JSON.stringify([...guests.values()]), "utf8");
  renameSync(pending, guestFile);
}
function saveAnnouncements() {
  const pending = announcementFile + ".tmp";
  writeFileSync(pending, JSON.stringify(announcements), "utf8");
  renameSync(pending, announcementFile);
}
function authorizedAdmin(authorization?: string) {
  const secret = process.env.MCHESS_ADMIN_TOKEN;
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice(7);
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(secret).digest());
}
function saveRooms() {
  const snapshot = [...rooms.values()].map(({ id, chess, seats, createdAt, resignedBy, flagged, drawOfferedBy, drawAgreed, clocks, turnStartedAt, incrementMs, guestIds, rated, ratingApplied }) => ({
    id, pgn: chess.pgn(), seats, createdAt, resignedBy, flagged, drawOfferedBy, drawAgreed, clocks, turnStartedAt, incrementMs, guestIds, rated, ratingApplied
  }));
  const pending = dataFile + ".tmp";
  writeFileSync(pending, JSON.stringify(snapshot), "utf8");
  renameSync(pending, dataFile);
}
const id = () => randomBytes(6).toString("hex");
const token = () => randomBytes(24).toString("hex");
const startingRating: Record<Level, number> = { beginner: 400, amateur: 1000, experienced: 1500, professional: 2000 };
const avatarChoices = new Set<Avatar>(["knight", "queen", "rook", "bishop", "king"]);
const matchmakingTimeoutMs = Number(process.env.MCHESS_MATCH_TIMEOUT_MS || 30_000);
const publicGuest = (guest: Guest) => ({ id: guest.id, name: guest.name, level: guest.level, avatar: guest.avatar || "knight", rating: guest.rating, ratedGames: guest.ratedGames, gamesToLeaderboard: Math.max(0, 10 - guest.ratedGames), wins: guest.wins, losses: guest.losses, draws: guest.draws });
const authorizedGuest = (authorization?: string) => [...guests.values()].find(guest => authorization === `Bearer ${guest.token}`);

function result(room: Room): string | null {
  if (room.drawAgreed) return "1/2-1/2";
  if (room.flagged) return room.flagged === "w" ? "0-1" : "1-0";
  if (room.resignedBy) return room.resignedBy === "w" ? "0-1" : "1-0";
  if (room.chess.isCheckmate()) return room.chess.turn() === "w" ? "0-1" : "1-0";
  if (room.chess.isDraw()) return "1/2-1/2";
  return null;
}

function finalizeRating(room: Room) {
  if (!room.rated || room.ratingApplied || !room.guestIds?.w || !room.guestIds?.b) return;
  const outcome = result(room);
  if (!outcome) return;
  const white = guests.get(room.guestIds.w);
  const black = guests.get(room.guestIds.b);
  if (!white || !black) return;
  if (white.ratedRoomIds?.includes(room.id) && black.ratedRoomIds?.includes(room.id)) {
    room.ratingApplied = true;
    saveRooms();
    return;
  }
  const whiteScore = outcome === "1-0" ? 1 : outcome === "0-1" ? 0 : 0.5;
  const expectedWhite = 1 / (1 + Math.pow(10, (black.rating - white.rating) / 400));
  const expectedBlack = 1 - expectedWhite;
  white.rating = Math.max(100, Math.round(white.rating + 32 * (whiteScore - expectedWhite)));
  black.rating = Math.max(100, Math.round(black.rating + 32 * ((1 - whiteScore) - expectedBlack)));
  white.ratedGames++;
  black.ratedGames++;
  white.ratedRoomIds = [...(white.ratedRoomIds || []), room.id];
  black.ratedRoomIds = [...(black.ratedRoomIds || []), room.id];
  for (const [guest, score] of [[white, whiteScore], [black, 1 - whiteScore]] as const) {
    if (score === 1) guest.wins++;
    else if (score === 0) guest.losses++;
    else guest.draws++;
  }
  room.ratingApplied = true;
  saveGuests();
  saveRooms();
}

function clockState(room: Room): Record<Seat, number> {
  const clocks = { ...room.clocks };
  if (room.turnStartedAt && !result(room)) clocks[room.chess.turn()] = Math.max(0, clocks[room.chess.turn()] - (Date.now() - room.turnStartedAt));
  return clocks;
}

function expireClock(room: Room) {
  if (!room.turnStartedAt || result(room)) return;
  const turn = room.chess.turn();
  if (room.clocks[turn] - (Date.now() - room.turnStartedAt) > 0) return;
  room.clocks[turn] = 0;
  room.turnStartedAt = undefined;
  room.flagged = turn;
  saveRooms();
  finalizeRating(room);
}

function state(room: Room) {
  return {
    type: "state",
    roomId: room.id,
    fen: room.chess.fen(),
    turn: room.chess.turn(),
    moves: room.chess.history(),
    pgn: room.chess.pgn(),
    whiteJoined: Boolean(room.seats.w),
    blackJoined: Boolean(room.seats.b),
    check: room.chess.isCheck(),
    result: result(room),
    clocks: clockState(room),
    incrementMs: room.incrementMs,
    drawOfferedBy: room.drawOfferedBy ?? null,
    rated: Boolean(room.rated),
    whitePlayer: room.guestIds?.w && guests.has(room.guestIds.w) ? publicGuest(guests.get(room.guestIds.w)!) : null,
    blackPlayer: room.guestIds?.b && guests.has(room.guestIds.b) ? publicGuest(guests.get(room.guestIds.b)!) : null
  };
}

function broadcast(room: Room) {
  finalizeRating(room);
  const payload = JSON.stringify(state(room));
  for (const group of Object.values(room.sockets)) {
    for (const socket of group ?? []) if (socket.readyState === 1) socket.send(payload);
  }
}

function findSeat(room: Room, seatToken: string): Seat | null {
  if (room.seats.w === seatToken) return "w";
  if (room.seats.b === seatToken) return "b";
  return null;
}

app.get("/health", async () => ({ ok: true, rooms: rooms.size }));
app.get("/api/announcements", async () => announcements.slice(-20).reverse());
app.post<{ Body: { title?: string; body?: string } }>("/api/admin/announcements", async (request, reply) => {
  if (!process.env.MCHESS_ADMIN_TOKEN || process.env.MCHESS_ADMIN_TOKEN.length < 32) return reply.code(503).send({ error: "admin_not_configured" });
  if (!authorizedAdmin(request.headers.authorization)) return reply.code(401).send({ error: "unauthorized" });
  const title = String(request.body?.title || "").trim().slice(0, 80);
  const body = String(request.body?.body || "").trim().slice(0, 2000);
  if (!title || !body) return reply.code(400).send({ error: "title_and_body_required" });
  const item: Announcement = { id: id(), title, body, createdAt: Date.now() };
  announcements = [...announcements.slice(-99), item];
  saveAnnouncements();
  const payload = JSON.stringify({ type: "announcement", item });
  for (const socket of announcementSockets) if (socket.readyState === 1) socket.send(payload);
  return reply.code(201).send(item);
});
app.get("/ws/announcements", { websocket: true }, socket => {
  announcementSockets.add(socket);
  socket.on("close", () => announcementSockets.delete(socket));
});
app.post<{ Body: { name?: string; level?: Level; avatar?: Avatar } }>("/api/guests", async (request, reply) => {
  const level = request.body?.level;
  if (!level || !Object.hasOwn(startingRating, level)) return reply.code(400).send({ error: "invalid_level" });
  const name = String(request.body?.name || "Гость").trim().slice(0, 24) || "Гость";
  const avatar = request.body?.avatar && avatarChoices.has(request.body.avatar) ? request.body.avatar : "knight";
  const guest: Guest = { id: id(), token: token(), name, level, avatar, rating: startingRating[level], ratedGames: 0, wins: 0, losses: 0, draws: 0, ratedRoomIds: [] };
  guests.set(guest.id, guest);
  saveGuests();
  return { token: guest.token, profile: publicGuest(guest) };
});

app.get("/api/me", async (request, reply) => {
  const guest = authorizedGuest(request.headers.authorization);
  if (!guest) return reply.code(401).send({ error: "unauthorized" });
  return publicGuest(guest);
});

app.get("/api/leaderboard", async () => [...guests.values()].filter(guest => guest.ratedGames >= 10)
  .sort((a, b) => b.rating - a.rating).slice(0, 100).map(publicGuest));

app.post("/api/matchmaking", async (request, reply) => {
  const guest = authorizedGuest(request.headers.authorization);
  if (!guest) return reply.code(401).send({ error: "unauthorized" });
  const existing = [...tickets.values()].find(ticket => ticket.guestId === guest.id && (ticket.status === "waiting" || ticket.status === "matched" && ticket.session && !result(rooms.get(ticket.session.roomId)!)));
  if (existing) return { ticketId: existing.id, status: existing.status, session: existing.session ?? null };
  const waiting = [...tickets.values()].filter(ticket => ticket.status === "waiting")
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .find(ticket => {
      const opponent = guests.get(ticket.guestId);
      return opponent && opponent.id !== guest.id && Date.now() - ticket.joinedAt < matchmakingTimeoutMs && Math.abs(opponent.rating - guest.rating) <= 200;
    });
  const next: MatchTicket = { id: id(), guestId: guest.id, joinedAt: Date.now(), status: "waiting" };
  tickets.set(next.id, next);
  if (!waiting) return { ticketId: next.id, status: next.status, session: null };
  const room: Room = {
    id: id(), chess: new Chess(), seats: { w: token(), b: token() }, sockets: {}, createdAt: Date.now(),
    clocks: { w: 600_000, b: 600_000 }, incrementMs: 0, turnStartedAt: Date.now(), seenMoveIds: new Set(),
    guestIds: { w: waiting.guestId, b: guest.id }, rated: true
  };
  rooms.set(room.id, room);
  waiting.status = "matched";
  waiting.session = { roomId: room.id, seat: "w", seatToken: room.seats.w! };
  next.status = "matched";
  next.session = { roomId: room.id, seat: "b", seatToken: room.seats.b! };
  saveRooms();
  return { ticketId: next.id, status: next.status, session: next.session, state: state(room) };
});

app.get<{ Params: { ticketId: string } }>("/api/matchmaking/:ticketId", async (request, reply) => {
  const guest = authorizedGuest(request.headers.authorization);
  const ticket = tickets.get(request.params.ticketId);
  if (!guest || !ticket || ticket.guestId !== guest.id) return reply.code(404).send({ error: "ticket_not_found" });
  if (ticket.status === "waiting" && Date.now() - ticket.joinedAt >= matchmakingTimeoutMs) ticket.status = "bot";
  return { ticketId: ticket.id, status: ticket.status, session: ticket.session ?? null,
    state: ticket.session ? state(rooms.get(ticket.session.roomId)!) : null };
});

app.delete<{ Params: { ticketId: string } }>("/api/matchmaking/:ticketId", async (request, reply) => {
  const guest = authorizedGuest(request.headers.authorization);
  const ticket = tickets.get(request.params.ticketId);
  if (!guest || !ticket || ticket.guestId !== guest.id) return reply.code(404).send({ error: "ticket_not_found" });
  if (ticket.status === "waiting") tickets.delete(ticket.id);
  return { ok: true };
});

app.post("/api/rooms", async request => {
  const guest = authorizedGuest(request.headers.authorization);
  const room: Room = {
    id: id(),
    chess: new Chess(),
    seats: { w: token() },
    sockets: {},
    createdAt: Date.now(),
    clocks: { w: 600_000, b: 600_000 },
    incrementMs: 0,
    seenMoveIds: new Set(),
    guestIds: guest ? { w: guest.id } : undefined
  };
  rooms.set(room.id, room);
  saveRooms();
  return { roomId: room.id, seat: "w", seatToken: room.seats.w, state: state(room) };
});

app.get<{ Params: { roomId: string } }>("/api/rooms/:roomId", async (request, reply) => {
  const room = rooms.get(request.params.roomId);
  if (!room) return reply.code(404).send({ error: "room_not_found" });
  return state(room);
});

app.post<{ Params: { roomId: string } }>("/api/rooms/:roomId/join", async (request, reply) => {
  const room = rooms.get(request.params.roomId);
  if (!room) return reply.code(404).send({ error: "room_not_found" });
  if (room.seats.b) return reply.code(409).send({ error: "room_full" });
  room.seats.b = token();
  const guest = authorizedGuest(request.headers.authorization);
  if (guest) room.guestIds = { ...room.guestIds, b: guest.id };
  room.turnStartedAt = Date.now();
  saveRooms();
  broadcast(room);
  return { roomId: room.id, seat: "b", seatToken: room.seats.b, state: state(room) };
});

app.get<{ Params: { roomId: string }; Querystring: { token?: string } }>(
  "/ws/rooms/:roomId",
  { websocket: true },
  (socket, request) => {
    const room = rooms.get(request.params.roomId);
    const seat = room && request.query.token ? findSeat(room, request.query.token) : null;
    if (!room || !seat) {
      socket.close(1008, "invalid room or seat");
      return;
    }

    const group = room.sockets[seat] ?? new Set();
    room.sockets[seat] = group;
    group.add(socket);
    socket.send(JSON.stringify(state(room)));
    broadcast(room);

    socket.on("message", (raw: unknown) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "invalid_json" }));
        return;
      }
      expireClock(room);
      if (result(room)) {
        socket.send(JSON.stringify({ type: "error", error: "game_finished" }));
        return;
      }
      if (message.type === "resign") {
        room.resignedBy = seat;
        room.turnStartedAt = undefined;
        saveRooms();
        broadcast(room);
        return;
      }
      if (message.type === "offer_draw") {
        room.drawOfferedBy = seat;
        saveRooms();
        broadcast(room);
        return;
      }
      if (message.type === "accept_draw" && room.drawOfferedBy && room.drawOfferedBy !== seat) {
        room.drawAgreed = true;
        room.turnStartedAt = undefined;
        saveRooms();
        broadcast(room);
        return;
      }
      if (message.type === "decline_draw" && room.drawOfferedBy && room.drawOfferedBy !== seat) {
        room.drawOfferedBy = undefined;
        saveRooms();
        broadcast(room);
        return;
      }
      if (message.type !== "move" || !/^[a-h][1-8]$/.test(message.from) || !/^[a-h][1-8]$/.test(message.to)) {
        socket.send(JSON.stringify({ type: "error", error: "invalid_move" }));
        return;
      }
      if (room.chess.turn() !== seat) {
        socket.send(JSON.stringify({ type: "error", error: "not_your_turn" }));
        return;
      }
      const moveId = message.clientMoveId ? seat + ":" + message.clientMoveId : undefined;
      if (moveId && room.seenMoveIds.has(moveId)) {
        socket.send(JSON.stringify(state(room)));
        return;
      }
      const elapsed = room.turnStartedAt ? Date.now() - room.turnStartedAt : 0;
      try {
        room.chess.move({ from: message.from, to: message.to, promotion: message.promotion || "q" });
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "illegal_move" }));
        return;
      }
      if (moveId) room.seenMoveIds.add(moveId);
      room.clocks[seat] = Math.max(0, room.clocks[seat] - elapsed);
      room.clocks[seat] += room.incrementMs;
      room.turnStartedAt = Date.now();
      room.drawOfferedBy = undefined;
      saveRooms();
      broadcast(room);
    });
    socket.on("close", () => {
      group.delete(socket);
      if (group.size === 0) delete room.sockets[seat];
    });
  }
);

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.turnStartedAt || result(room)) continue;
    expireClock(room);
    broadcast(room);
  }
}, 1000).unref();

const port = Number(process.env.PORT || 3001);
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(join(webDist, "index.html"))) {
  await app.register(fastifyStatic, { root: webDist, prefix: "/" });
  app.get("/admin", async (_request, reply) => reply.sendFile("index.html"));
}
await app.listen({ port, host: "0.0.0.0" });
