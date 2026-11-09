import { get, head, put, BlobPreconditionFailedError } from "@vercel/blob";
import { Chess } from "chess.js";
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

type Seat = "w" | "b";
type Guest = { id: string; token: string; name: string; level: string; avatar: string; rating: number; ratedGames: number; wins: number; losses: number; draws: number; ratedRoomIds: string[]; verified?: boolean };
type Session = { roomId: string; seat: Seat; seatToken: string };
type Ticket = { id: string; guestId: string; joinedAt: number; status: "waiting" | "matched" | "bot" | "cancelled"; session?: Session };
type Room = { id: string; pgn: string; seats: Partial<Record<Seat, string>>; guestIds?: Partial<Record<Seat, string>>; createdAt: number; clocks: Record<Seat, number>; turnStartedAt?: number; promoPendingFor?: Seat; incrementMs: number; rated?: boolean; ratingApplied?: boolean; ratingDelta?: Record<Seat, number>; resignedBy?: Seat; flagged?: Seat; drawOfferedBy?: Seat; drawAgreed?: boolean; seenMoveIds: string[] };
type Data = { guests: Guest[]; tickets: Ticket[]; rooms: Room[]; announcements: { id: string; title: string; body: string; createdAt: number }[] };
const PATH = "mchess/online-state-v1.json";
const empty = (): Data => ({ guests: [], tickets: [], rooms: [], announcements: [] });
const id = () => randomBytes(6).toString("hex");
const token = () => randomBytes(24).toString("hex");
const ratings: Record<string, number> = { beginner: 400, amateur: 1000, experienced: 1500, professional: 2000 };
const avatars = new Set(["knight", "queen", "rook", "bishop", "king"]);
const json = (res: ServerResponse, status: number, data: unknown) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(data)); };
const publicGuest = (g: Guest) => ({ id: g.id, name: g.name, level: g.level, avatar: g.avatar, rating: g.rating, ratedGames: g.ratedGames, gamesToLeaderboard: Math.max(0, 10 - g.ratedGames), wins: g.wins, losses: g.losses, draws: g.draws, verified: Boolean(g.verified) });
const auth = (data: Data, req: IncomingMessage) => data.guests.find(g => req.headers.authorization === `Bearer ${g.token}`);
async function read(forUpdate = false): Promise<{ data: Data; etag?: string }> {
  const current = await get(PATH, { access: "private", useCache: false });
  if (!current || current.statusCode !== 200) return { data: empty() };
  const data = JSON.parse(await new Response(current.stream).text()) as Data;
  if (!forUpdate) return { data };
  const metadata = await head(PATH);
  const normalizeEtag = (etag: string) => etag.replace(/^W\//, "").replaceAll('"', '');
  if (!metadata || normalizeEtag(current.blob.etag) !== normalizeEtag(metadata.etag)) throw new Error("state_changed_during_read");
  return { data, etag: metadata.etag };
}
async function update(change: (data: Data) => { status: number; body: unknown; dirty?: boolean }): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    let snapshot;
    try { snapshot = await read(true); } catch (error) { if (error instanceof Error && error.message === "state_changed_during_read") continue; throw error; }
    const { data, etag } = snapshot;
    const result = change(data);
    if (!result.dirty) return result;
    try {
      await put(PATH, JSON.stringify(data), { access: "private", contentType: "application/json", allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}) });
      return result;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || (error instanceof Error && /already exists|precondition/i.test(error.message))) continue;
      throw error;
    }
  }
  return { status: 503, body: { error: "state_busy" } };
}
async function body(req: IncomingMessage) {
  let value = "";
  for await (const chunk of req) { value += String(chunk); if (value.length > 10_000) throw new Error("body_too_large"); }
  return value ? JSON.parse(value) as Record<string, unknown> : {};
}
function chess(room: Room) { const game = new Chess(); if (room.pgn) game.loadPgn(room.pgn); return game; }
function result(room: Room, game = chess(room)): string | null {
  if (room.drawAgreed) return "1/2-1/2";
  if (room.flagged) return room.flagged === "w" ? "0-1" : "1-0";
  if (room.resignedBy) return room.resignedBy === "w" ? "0-1" : "1-0";
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  return game.isDraw() ? "1/2-1/2" : null;
}
function clocks(room: Room, game: Chess) {
  const value = { ...room.clocks };
  if (room.turnStartedAt && room.seats.b && !result(room, game)) value[game.turn()] = Math.max(0, value[game.turn()] - (Date.now() - room.turnStartedAt));
  return value;
}
function roomState(data: Data, room: Room) {
  const game = chess(room);
  return { type: "state", roomId: room.id, fen: game.fen(), turn: game.turn(), moves: game.history(), pgn: room.pgn, whiteJoined: Boolean(room.seats.w), blackJoined: Boolean(room.seats.b), check: game.isCheck(), result: result(room, game), clocks: clocks(room, game), promoPendingFor: room.promoPendingFor || null, incrementMs: room.incrementMs, drawOfferedBy: room.drawOfferedBy || null, rated: Boolean(room.rated), ratingDelta: room.ratingDelta || null, whitePlayer: data.guests.find(g => g.id === room.guestIds?.w) ? publicGuest(data.guests.find(g => g.id === room.guestIds?.w)!) : null, blackPlayer: data.guests.find(g => g.id === room.guestIds?.b) ? publicGuest(data.guests.find(g => g.id === room.guestIds?.b)!) : null };
}
function startOrPauseForPromo(data: Data, room: Room) {
  const white = data.guests.find(g => g.id === room.guestIds?.w);
  const black = data.guests.find(g => g.id === room.guestIds?.b);
  room.promoPendingFor = white?.verified && !black?.verified ? "b" : black?.verified && !white?.verified ? "w" : undefined;
  room.turnStartedAt = room.promoPendingFor ? undefined : Date.now();
}
function settleRating(data: Data, room: Room) {
  if (!room.rated || room.ratingApplied || !room.guestIds?.w || !room.guestIds?.b) return;
  const outcome = result(room);
  if (!outcome) return;
  const w = data.guests.find(g => g.id === room.guestIds?.w), b = data.guests.find(g => g.id === room.guestIds?.b);
  if (!w || !b) return;
  const score = outcome === "1-0" ? 1 : outcome === "0-1" ? 0 : 0.5;
  const expected = 1 / (1 + Math.pow(10, (b.rating - w.rating) / 400));
  const oldWhite = w.rating, oldBlack = b.rating;
  w.rating = Math.max(100, Math.round(w.rating + (w.ratedGames < 10 ? 40 : 20) * (score - expected)));
  b.rating = Math.max(100, Math.round(b.rating + (b.ratedGames < 10 ? 40 : 20) * (expected - score)));
  room.ratingDelta = { w: w.rating - oldWhite, b: b.rating - oldBlack };
  for (const [g, s] of [[w, score], [b, 1 - score]] as const) { g.ratedGames++; g.ratedRoomIds.push(room.id); if (s === 1) g.wins++; else if (s === 0) g.losses++; else g.draws++; }
  room.ratingApplied = true;
}
function seat(room: Room, supplied: string | null): Seat | null { return supplied && room.seats.w === supplied ? "w" : supplied && room.seats.b === supplied ? "b" : null; }

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url || "/", "https://mchess.local");
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  const method = req.method || "GET";
  try {
    if (method === "GET" && parts[0] === "health") return json(res, 200, { ok: true, storage: "vercel-blob" });
    if (method === "GET" && parts[0] === "announcements") return json(res, 200, (await read()).data.announcements.slice(-20).reverse());
    if (method === "POST" && parts[0] === "guests") {
      const input = await body(req); const level = String(input.level || "");
      if (!(level in ratings)) return json(res, 400, { error: "invalid_level" });
      const response = await update(data => { const g: Guest = { id: id(), token: token(), name: String(input.name || "Гость").trim().slice(0, 24) || "Гость", level, avatar: avatars.has(String(input.avatar)) ? String(input.avatar) : "knight", rating: ratings[level], ratedGames: 0, wins: 0, losses: 0, draws: 0, ratedRoomIds: [] }; data.guests.push(g); return { status: 201, body: { token: g.token, profile: publicGuest(g) }, dirty: true }; });
      return json(res, response.status, response.body);
    }
    if (method === "GET" && parts[0] === "me") { const data = (await read()).data; const guest = auth(data, req); return json(res, guest ? 200 : 401, guest ? publicGuest(guest) : { error: "unauthorized" }); }
    if (method === "POST" && parts[0] === "me" && parts[1] === "promo") { const input = await body(req); const correct = createHash("sha256").update(String(input.code || "").trim()).digest("hex") === "810b66e9caf3d9120fbccf56f0d76551af47c5286c77e1cf7ba77c777a6be31e"; if (!correct) return json(res, 400, { error: "invalid_promo" }); const response = await update(data => { const guest = auth(data, req); if (!guest) return { status: 401, body: { error: "unauthorized" } }; if (guest.verified) return { status: 200, body: publicGuest(guest) }; guest.verified = true; return { status: 200, body: publicGuest(guest), dirty: true }; }); return json(res, response.status, response.body); }
    if (method === "GET" && parts[0] === "leaderboard") return json(res, 200, (await read()).data.guests.filter(g => g.ratedGames >= 10).sort((a,b) => b.rating - a.rating).slice(0,100).map(publicGuest));
    if (parts[0] === "matchmaking") {
      if (method === "POST" && !parts[1]) { const response = await update(data => {
        const guest = auth(data, req); if (!guest) return { status: 401, body: { error: "unauthorized" } };
        const existing = data.tickets.find(t => t.guestId === guest.id && (t.status === "waiting" || t.status === "matched" && t.session && !result(data.rooms.find(r => r.id === t.session?.roomId)!)));
        if (existing) return { status: 200, body: { ticketId: existing.id, status: existing.status, session: existing.session || null } };
        const waiting = data.tickets.filter(t => t.status === "waiting" && t.guestId !== guest.id && Date.now() - t.joinedAt < 30_000).sort((a,b) => a.joinedAt - b.joinedAt).find(t => Math.abs((data.guests.find(g => g.id === t.guestId)?.rating ?? -10000) - guest.rating) <= 200);
        const next: Ticket = { id: id(), guestId: guest.id, joinedAt: Date.now(), status: "waiting" }; data.tickets.push(next);
        if (waiting) { const room: Room = { id: id(), pgn: "", seats: { w: token(), b: token() }, guestIds: { w: waiting.guestId, b: guest.id }, createdAt: Date.now(), clocks: { w: 600000, b: 600000 }, incrementMs: 0, rated: true, seenMoveIds: [] }; startOrPauseForPromo(data, room); data.rooms.push(room); waiting.status = "matched"; waiting.session = { roomId: room.id, seat: "w", seatToken: room.seats.w! }; next.status = "matched"; next.session = { roomId: room.id, seat: "b", seatToken: room.seats.b! }; }
        return { status: 200, body: { ticketId: next.id, status: next.status, session: next.session || null }, dirty: true };
      }); return json(res, response.status, response.body); }
      if (parts[1] && method === "GET") { const data = (await read()).data; const guest = auth(data, req); const ticket = data.tickets.find(t => t.id === parts[1] && t.guestId === guest?.id); if (!ticket) return json(res, 404, { error: "ticket_not_found" }); const status = ticket.status === "waiting" && Date.now() - ticket.joinedAt >= 30_000 ? "bot" : ticket.status; return json(res, 200, { ticketId: ticket.id, status, session: ticket.session || null, state: ticket.session ? roomState(data, data.rooms.find(r => r.id === ticket.session?.roomId)!) : null }); }
      if (parts[1] && method === "DELETE") { const response = await update(data => { const guest = auth(data, req); const t = data.tickets.find(t => t.id === parts[1] && t.guestId === guest?.id); if (!t) return { status: 404, body: { error: "ticket_not_found" } }; if (t.status === "waiting") t.status = "cancelled"; return { status: 200, body: { ok: true }, dirty: true }; }); return json(res, response.status, response.body); }
    }
    if (parts[0] === "rooms") {
      if (!parts[1] && method === "POST") { const response = await update(data => { const guest = auth(data, req); const room: Room = { id: id(), pgn: "", seats: { w: token() }, guestIds: guest ? { w: guest.id } : undefined, createdAt: Date.now(), clocks: { w: 600000, b: 600000 }, incrementMs: 0, seenMoveIds: [] }; data.rooms.push(room); return { status: 201, body: { roomId: room.id, seat: "w", seatToken: room.seats.w, state: roomState(data, room) }, dirty: true }; }); return json(res, response.status, response.body); }
      if (parts[1] && !parts[2] && method === "GET") { const data = (await read()).data; const room = data.rooms.find(r => r.id === parts[1]); return json(res, room ? 200 : 404, room ? roomState(data, room) : { error: "room_not_found" }); }
      if (parts[1] && parts[2] === "join" && method === "POST") { const response = await update(data => { const room = data.rooms.find(r => r.id === parts[1]); if (!room) return { status: 404, body: { error: "room_not_found" } }; if (room.seats.b) return { status: 409, body: { error: "room_full" } }; room.seats.b = token(); const guest = auth(data, req); if (guest) room.guestIds = { ...room.guestIds, b: guest.id }; startOrPauseForPromo(data, room); return { status: 200, body: { roomId: room.id, seat: "b", seatToken: room.seats.b, state: roomState(data, room) }, dirty: true }; }); return json(res, response.status, response.body); }
      if (parts[1] && parts[2] === "action" && method === "POST") { const input = await body(req); const response = await update(data => { const room = data.rooms.find(r => r.id === parts[1]); const player = room && seat(room, url.searchParams.get("token")); if (!room || !player) return { status: 403, body: { error: "invalid_room_or_seat" } }; const game = chess(room); if (result(room, game)) return { status: 409, body: { error: "game_finished" } };
        const kind = String(input.type || "");
        if (kind === "promo_finished") { if (room.promoPendingFor !== player) return { status: 409, body: { error: "promo_not_pending" } }; room.promoPendingFor = undefined; room.turnStartedAt = Date.now(); }
        else if (kind === "resign") room.resignedBy = player;
        else if (kind === "offer_draw") room.drawOfferedBy = player;
        else if (kind === "accept_draw" && room.drawOfferedBy && room.drawOfferedBy !== player) room.drawAgreed = true;
        else if (kind === "decline_draw" && room.drawOfferedBy && room.drawOfferedBy !== player) room.drawOfferedBy = undefined;
        else if (kind === "move") { if (room.promoPendingFor) return { status: 409, body: { error: "intro_playing" } }; const from = String(input.from || ""), to = String(input.to || ""); if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return { status: 400, body: { error: "invalid_move" } }; const moveId = player + ":" + String(input.clientMoveId || ""); if (input.clientMoveId && room.seenMoveIds.includes(moveId)) return { status: 200, body: roomState(data, room) }; if (game.turn() !== player) return { status: 409, body: { error: "not_your_turn" } }; const elapsed = room.turnStartedAt ? Date.now() - room.turnStartedAt : 0; if (room.clocks[player] - elapsed <= 0) { room.flagged = player; room.turnStartedAt = undefined; } else { try { game.move({ from, to, promotion: String(input.promotion || "q") }); } catch { return { status: 400, body: { error: "illegal_move" } }; } room.pgn = game.pgn(); room.clocks[player] = Math.max(0, room.clocks[player] - elapsed) + room.incrementMs; room.turnStartedAt = Date.now(); room.drawOfferedBy = undefined; if (input.clientMoveId) room.seenMoveIds.push(moveId); } }
        else return { status: 400, body: { error: "invalid_action" } };
        if (result(room, game)) room.turnStartedAt = undefined;
        settleRating(data, room);
        return { status: 200, body: roomState(data, room), dirty: true };
      }); return json(res, response.status, response.body); }
    }
    return json(res, 404, { error: "not_found" });
  } catch (error) { console.error("MChess online API", error); return json(res, 500, { error: "server_error" }); }
}

