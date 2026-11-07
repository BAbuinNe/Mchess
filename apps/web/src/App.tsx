import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "./ChessBoard";
import Training from "./Training";
import { engine, type EngineResult } from "./engine";
import CoachReaction from "./CoachReaction";
import LiveEvaluation, { type MoveKind } from "./LiveEvaluation";
import GameReport from "./GameReport";
import { identifyOpening, loadOpeningBook } from "./openingBook";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import ResultAnimation from "./ResultAnimation";
import { playMoveSound, vibrateForMate } from "./gameFeedback";
import NewsCenter from "./NewsCenter";
import IntroScreen from "./IntroScreen";

type Tab = "home" | "newgame" | "play" | "puzzles" | "learn" | "profile" | "analysis";
type Seat = "w" | "b";
type Level = "beginner" | "amateur" | "experienced" | "professional";
type Avatar = "knight" | "queen" | "rook" | "bishop" | "king";
const avatarGlyph: Record<Avatar, string> = { knight: "♞", queen: "♛", rook: "♜", bishop: "♝", king: "♚" };
type GuestProfile = { id: string; name: string; level: Level; avatar: Avatar; rating: number; ratedGames: number; gamesToLeaderboard: number; wins: number; losses: number; draws: number };
type OnlineState = {
  type: "state";
  roomId: string;
  fen: string;
  turn: Seat;
  moves: string[];
  pgn: string;
  whiteJoined: boolean;
  blackJoined: boolean;
  check: boolean;
  result: string | null;
  clocks: Record<Seat, number>;
  incrementMs: number;
  drawOfferedBy: Seat | null;
  rated?: boolean;
  whitePlayer?: GuestProfile | null;
  blackPlayer?: GuestProfile | null;
};
type Session = { roomId: string; seat: Seat; seatToken: string };

const DEFAULT_API = import.meta.env.VITE_API_URL || (Capacitor.isNativePlatform() ? "https://mchess-one.vercel.app" : window.location.port === "5173" ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin);
const botLevels = [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2400, 2800];
const coaches = [
  { name: "Магнус Карлсен", role: "Позиция и эндшпиль", image: "/assets/coaches/magnus-portrait.png" },
  { name: "Хикару Накамура", role: "Тактика и расчёт", image: "/assets/coaches/hikaru-portrait.png" },
  { name: "Анатолий Карпов", role: "Стратегия и защита", image: "/assets/coaches/karpov-portrait.png" },
  { name: "Мелстрой", role: "Эмоции и разбор", image: "/assets/coaches/mellstroy-portrait.png" }
];
function clock(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function validApi(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || (!Capacitor.isNativePlatform() && protocol === "http:");
  } catch { return false; }
}

function restoreLocal(): Chess {
  const chess = new Chess();
  try {
    const pgn = localStorage.getItem("mchess.localPgn");
    if (pgn) chess.loadPgn(pgn);
  } catch {
    return new Chess();
  }
  return chess;
}

export default function App() {
  const [showIntro, setShowIntro] = useState(() => Capacitor.isNativePlatform() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [tab, setTab] = useState<Tab>("home");
  const [localPgn, setLocalPgn] = useState(() => restoreLocal().pgn());
  const [mode, setMode] = useState<"local" | "online" | "bot">("local");
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState<OnlineState | null>(null);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [coach, setCoach] = useState(() => localStorage.getItem("mchess.coach") || "Магнус Карлсен");
  const [botLevel, setBotLevel] = useState(3);
  const [botThinking, setBotThinking] = useState(false);
  const [analysis, setAnalysis] = useState<EngineResult | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [reactionQueue, setReactionQueue] = useState<string[]>([]);
  const [moveKinds, setMoveKinds] = useState<Record<number, MoveKind>>({});
  const [pgnInput, setPgnInput] = useState("");
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("mchess.apiUrl") || DEFAULT_API);
  const hostedApi = apiUrl.includes(".vercel.app");
  const [guestToken, setGuestToken] = useState(() => localStorage.getItem("mchess.guestToken") || "");
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<GuestProfile[]>([]);
  const [guestName, setGuestName] = useState(() => localStorage.getItem("mchess.guestName") || "");
  const [guestLevel, setGuestLevel] = useState<Level>("amateur");
  const [guestAvatar, setGuestAvatar] = useState<Avatar>("knight");
  const [matchTicket, setMatchTicket] = useState<string | null>(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [moveBadges, setMoveBadges] = useState<{ ply: number; square: Square; kind: MoveKind }[]>([]);
  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const [openingReport, setOpeningReport] = useState<{ opening: string; gambit: string } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const onlineRef = useRef<OnlineState | null>(null);
  const badReactionIndex = useRef(0);
  const brilliantReactionIndex = useRef(0);
  const positiveReactionIndex = useRef(0);
  const negativeReactionIndex = useRef(0);
  const lastGenericReactionAt = useRef(0);
  const winReactionShown = useRef(false);
  const reactedPly = useRef(new Set<number>());

  function enqueueReaction(clip: string) {
    if (!reaction) setReaction(clip);
    else setReactionQueue(queue => [...queue, clip]);
  }
  function finishReaction() {
    setReactionQueue(queue => {
      const [next, ...rest] = queue;
      setReaction(next ?? null);
      return rest;
    });
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      if (tab === "home") void NativeApp.minimizeApp();
      else setTab("home");
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [tab]);

  useEffect(() => {
    if (!guestToken || !validApi(apiUrl)) return;
    let active = true;
    void fetch(apiUrl + "/api/me", { headers: { Authorization: `Bearer ${guestToken}` } })
      .then(response => response.ok ? response.json() as Promise<GuestProfile> : Promise.reject())
      .then(profile => { if (active) setGuest(profile); })
      .catch(() => { if (active) setGuest(null); });
    return () => { active = false; };
  }, [guestToken, apiUrl]);

  useEffect(() => {
    if (tab !== "profile" || !validApi(apiUrl)) return;
    let active = true;
    void fetch(apiUrl + "/api/leaderboard")
      .then(response => response.ok ? response.json() as Promise<GuestProfile[]> : Promise.reject())
      .then(list => { if (active) setLeaderboard(list); })
      .catch(() => { if (active) setLeaderboard([]); });
    return () => { active = false; };
  }, [tab, apiUrl, guest?.ratedGames]);

  useEffect(() => {
    if (!matchTicket || !guestToken || !validApi(apiUrl)) return;
    let active = true;
    let busy = false;
    const started = Date.now();
    const poll = async () => {
      if (!active || busy) return;
      busy = true;
      setSearchSeconds(Math.min(30, Math.floor((Date.now() - started) / 1000)));
      try {
        const response = await fetch(apiUrl + "/api/matchmaking/" + matchTicket, { headers: { Authorization: `Bearer ${guestToken}` } });
        if (!response.ok) throw new Error("matchmaking_unavailable");
        const data = await response.json() as { status: "waiting" | "matched" | "bot"; session: Session | null; state: OnlineState | null };
        if (!active) return;
        if (data.status === "matched" && data.session && data.state) {
          localStorage.setItem("mchess.room." + data.session.roomId, JSON.stringify(data.session));
          setSession(data.session);
          setOnline(data.state);
          setMode("online");
          setTab("play");
          setMatchTicket(null);
          setNotice("Соперник найден. Рейтинговая партия началась.");
        } else if (data.status === "bot") {
          setMatchTicket(null);
          setBotLevel(botLevels.reduce((best, elo, index) => Math.abs(elo - (guest?.rating || 1000)) < Math.abs(botLevels[best] - (guest?.rating || 1000)) ? index : best, 0));
          startBot();
          setNotice("За 30 секунд соперник не нашёлся. Началась нерейтинговая партия с ботом.");
        }
      } catch {
        if (active) { setMatchTicket(null); setNotice("Не удалось продолжить поиск соперника. Проверьте соединение."); }
      } finally { busy = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [matchTicket, guestToken, apiUrl, guest?.rating]);

  const local = new Chess();
  if (localPgn) {
    try { local.loadPgn(localPgn); } catch { /* keep a playable board */ }
  }
  const currentFen = mode === "online" && online ? online.fen : local.fen();
  const moves = mode === "online" && online ? online.moves : local.history();
  let lastMove = local.history({ verbose: true }).at(-1) ?? null;
  if (mode === "online" && online?.pgn) {
    try {
      const onlineGame = new Chess();
      onlineGame.loadPgn(online.pgn);
      lastMove = onlineGame.history({ verbose: true }).at(-1) ?? null;
    } catch { lastMove = null; }
  }
  const orientation = (mode === "online" && session?.seat === "b" ? !flipped : flipped) ? "b" : "w";
  const gameResult = mode === "online" ? online?.result : local.isCheckmate()
    ? (local.turn() === "w" ? "0-1" : "1-0")
    : local.isDraw() ? "1/2-1/2" : null;
  const playerWon = gameResult && gameResult !== "1/2-1/2" && (mode === "bot" ? gameResult === "1-0" : mode === "online" ? gameResult === (session?.seat === "w" ? "1-0" : "0-1") : null);
  const resultOutcome = gameResult === "1/2-1/2" ? "draw" : playerWon === false ? "defeat" : "victory";

  useEffect(() => {
    if (mode !== "online" || !gameResult || !guestToken || !validApi(apiUrl)) return;
    void fetch(apiUrl + "/api/me", { headers: { Authorization: `Bearer ${guestToken}` } })
      .then(response => response.ok ? response.json() as Promise<GuestProfile> : Promise.reject())
      .then(setGuest).catch(() => {});
  }, [mode, gameResult, guestToken, apiUrl]);

  useEffect(() => {
    if (mode === "online" || (mode === "bot" && coach === "Мелстрой") || !gameResult || gameResult === "1/2-1/2" || reaction || winReactionShown.current) return;
    const winnerParity = gameResult === "1-0" ? 1 : 0;
    if (Object.entries(moveKinds).filter(([ply, kind]) => Number(ply) % 2 === winnerParity && kind === "brilliant").length < 2) return;
    const timer = window.setTimeout(() => {
      winReactionShown.current = true;
      enqueueReaction("/assets/reactions/events/brilliant-win.mp4");
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [mode, coach, gameResult, moveKinds, reaction]);

  useEffect(() => {
    if (gameResult && (mode === "bot" || mode === "online") && gameResult !== "1/2-1/2" && dismissedResult !== gameResult) vibrateForMate();
  }, [gameResult, mode]);

  useEffect(() => {
    if (!gameResult) { setOpeningReport(null); return; }
    let active = true;
    void loadOpeningBook().then(entries => {
      if (!active) return;
      const found = identifyOpening(moves, entries);
      setOpeningReport({
        opening: found.opening ? `${found.opening.name} (${found.opening.eco})` : "Не определён",
        gambit: found.gambit ? `${found.gambit.name} (${found.gambit.eco})` : "Не определён"
      });
    }).catch(() => { if (active) setOpeningReport(null); });
    return () => { active = false; };
  }, [gameResult, localPgn, online?.pgn]);

  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get("room");
    if (!roomId) return;
    const stored = localStorage.getItem("mchess.room." + roomId);
    if (stored) {
      try {
        setSession(JSON.parse(stored) as Session);
        setMode("online");
        setTab("play");
        return;
      } catch { /* join as a new participant */ }
    }
    void joinRoom(roomId);
  }, []);

  useEffect(() => {
    if (!session || !validApi(apiUrl)) return;
    if (hostedApi) {
      let active = true;
      const refresh = async () => {
        try {
          const response = await fetch(apiUrl + "/api/rooms/" + encodeURIComponent(session.roomId), { cache: "no-store" });
          if (!response.ok) throw new Error("room_unavailable");
          const state = await response.json() as OnlineState;
          if (!active) return;
          if (state.moves.length > (onlineRef.current?.moves.length ?? state.moves.length)) playMoveSound();
          onlineRef.current = state;
          setOnline(state);
          setConnected(true);
        } catch { if (active) setConnected(false); }
      };
      void refresh();
      const interval = window.setInterval(() => void refresh(), 1200);
      return () => { active = false; window.clearInterval(interval); };
    }
    const socket = new WebSocket(apiUrl.replace(/^http/, "ws") + "/ws/rooms/" + session.roomId + "?token=" + encodeURIComponent(session.seatToken));
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setNotice("Не удалось подключиться к серверу партии");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as OnlineState | { type: "error"; error: string };
      if (message.type === "state") {
        const previousMoveCount = onlineRef.current?.moves.length ?? message.moves.length;
        if (message.moves.length > previousMoveCount) playMoveSound();
        onlineRef.current = message;
        setOnline(message);
      }
      else setNotice("Ход не принят сервером: " + message.error);
    };
    return () => { socket.close(); if (socketRef.current === socket) socketRef.current = null; };
  }, [session, apiUrl, coach, hostedApi]);

  async function hostedAction(message: Record<string, unknown>) {
    if (!session) return;
    try {
      const response = await fetch(apiUrl + "/api/rooms/" + encodeURIComponent(session.roomId) + "/action?token=" + encodeURIComponent(session.seatToken), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
      const data = await response.json() as OnlineState | { error: string };
      if (!response.ok || !("type" in data) || data.type !== "state") throw new Error("error" in data ? data.error : "server_error");
      onlineRef.current = data;
      setOnline(data);
      if (message.type === "move") playMoveSound();
    } catch (error) { setNotice("Ход не принят сервером: " + (error instanceof Error ? error.message : "ошибка сети")); }
  }

  useEffect(() => {
    if (mode !== "bot" || local.turn() !== "b" || local.isGameOver()) return;
    let active = true;
    const fen = local.fen();
    setBotThinking(true);
    void engine().search(fen, Math.round(botLevel * 20 / 11), 450).then(result => {
      if (!active) return;
      const full = new Chess();
      if (localPgn) full.loadPgn(localPgn);
      if (full.fen() !== fen) return;
      const legal = full.moves({ verbose: true });
      const elo = botLevels[botLevel];
      const errorRate = Math.max(0, .76 * Math.pow((1600 - elo) / 1400, 1.6));
      const chooseMistake = elo < 1600 && Math.random() < errorRate;
      const chosen = chooseMistake ? legal[Math.floor(Math.random() * legal.length)] : null;
      full.move(chosen ?? { from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] || "q" });
      playMoveSound();
      setLocalPgn(full.pgn());
      localStorage.setItem("mchess.localPgn", full.pgn());
    }).catch(() => { if (active) setNotice("Движок Stockfish не загрузился. Обновите страницу."); })
      .finally(() => { if (active) setBotThinking(false); });
    return () => { active = false; };
  }, [mode, localPgn, botLevel, coach]);

  useEffect(() => {
    if (tab !== "analysis" || (mode === "online" && !online?.result)) return;
    let active = true;
    setAnalysis(null);
    setAnalysisBusy(true);
    void engine().search(currentFen, 20, 750).then(result => { if (active) setAnalysis(result); })
      .catch(() => { if (active) setNotice("Не удалось выполнить анализ Stockfish"); })
      .finally(() => { if (active) setAnalysisBusy(false); });
    return () => { active = false; };
  }, [tab, currentFen, mode, online?.result]);

  async function registerGuest() {
    if (!validApi(apiUrl)) { setNotice("Укажите HTTPS-адрес онлайн-сервера в профиле."); return; }
    try {
      const response = await fetch(apiUrl + "/api/guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: guestName, level: guestLevel, avatar: guestAvatar }) });
      if (!response.ok) throw new Error("registration_failed");
      const data = await response.json() as { token: string; profile: GuestProfile };
      localStorage.setItem("mchess.guestToken", data.token);
      localStorage.setItem("mchess.guestName", data.profile.name);
      setGuestToken(data.token);
      setGuest(data.profile);
      setNotice("Гостевой профиль создан. До таблицы рейтинга — 10 партий с людьми.");
    } catch { setNotice("Не удалось создать гостевой профиль. Проверьте сервер."); }
  }

  async function findMatch() {
    if (!guest || !guestToken) { setTab("profile"); setNotice("Создайте гостевой профиль для автоподбора."); return; }
    if (!validApi(apiUrl)) { setNotice("Укажите адрес онлайн-сервера в профиле."); return; }
    try {
      const response = await fetch(apiUrl + "/api/matchmaking", { method: "POST", headers: { Authorization: `Bearer ${guestToken}` } });
      if (!response.ok) throw new Error("matchmaking_failed");
      const data = await response.json() as { ticketId: string };
      setSearchSeconds(0);
      setMatchTicket(data.ticketId);
      setNotice("Ищем соперника в диапазоне ±200 Эло до 30 секунд.");
    } catch { setNotice("Не удалось начать поиск соперника."); }
  }

  async function cancelMatch() {
    if (matchTicket && guestToken && validApi(apiUrl)) {
      void fetch(apiUrl + "/api/matchmaking/" + matchTicket, { method: "DELETE", headers: { Authorization: `Bearer ${guestToken}` } });
    }
    setMatchTicket(null);
    setSearchSeconds(0);
  }

  async function createRoom() {
    if (matchTicket) await cancelMatch();
    setNotice("");
    try {
      if (!validApi(apiUrl)) throw new Error("server_not_configured");
      const response = await fetch(apiUrl + "/api/rooms", { method: "POST", headers: guestToken ? { Authorization: `Bearer ${guestToken}` } : {} });
      if (!response.ok) throw new Error("Сервер недоступен");
      const data = await response.json() as Session & { state: OnlineState };
      const next = { roomId: data.roomId, seat: data.seat, seatToken: data.seatToken };
      localStorage.setItem("mchess.room." + data.roomId, JSON.stringify(next));
      window.history.replaceState({}, "", "?room=" + data.roomId);
      setSession(next);
      setOnline(data.state);
      setMode("online");
      setTab("play");
      setNotice("Комната создана. Отправьте другу ссылку.");
    } catch {
      setNotice(validApi(apiUrl) ? "Онлайн-сервер недоступен. Проверьте адрес и соединение." : "Укажите адрес онлайн-сервера в профиле.");
    }
  }

  async function joinRoom(roomId: string) {
    if (matchTicket) await cancelMatch();
    setNotice("");
    try {
      if (!validApi(apiUrl)) throw new Error("server_not_configured");
      const response = await fetch(apiUrl + "/api/rooms/" + encodeURIComponent(roomId) + "/join", { method: "POST", headers: guestToken ? { Authorization: `Bearer ${guestToken}` } : {} });
      if (!response.ok) throw new Error("Комната недоступна или заполнена");
      const data = await response.json() as Session & { state: OnlineState };
      const next = { roomId: data.roomId, seat: data.seat, seatToken: data.seatToken };
      localStorage.setItem("mchess.room." + data.roomId, JSON.stringify(next));
      setSession(next);
      setOnline(data.state);
      setMode("online");
      setTab("play");
    } catch {
      setNotice(validApi(apiUrl) ? "Не удалось войти в комнату. Проверьте ссылку и сервер." : "Укажите адрес онлайн-сервера в профиле.");
    }
  }

  function startLocal() {
    if (matchTicket) void cancelMatch();
    window.history.replaceState({}, "", window.location.pathname);
    setMode("local");
    setFlipped(false);
    setSession(null);
    setOnline(null);
    setTab("play");
    setNotice("");
    setMoveBadges([]);
    setMoveKinds({});
    setDismissedResult(null);
    winReactionShown.current = false;
    reactedPly.current.clear();
    lastGenericReactionAt.current = 0;
    positiveReactionIndex.current = 0;
    negativeReactionIndex.current = 0;
  }

  function startBot() {
    if (matchTicket) void cancelMatch();
    setLocalPgn("");
    localStorage.removeItem("mchess.localPgn");
    window.history.replaceState({}, "", window.location.pathname);
    setSession(null);
    setOnline(null);
    setMode("bot");
    setMoveBadges([]);
    setMoveKinds({});
    winReactionShown.current = false;
    reactedPly.current.clear();
    lastGenericReactionAt.current = 0;
    positiveReactionIndex.current = 0;
    negativeReactionIndex.current = 0;
    setHintMove(null);
    setDismissedResult(null);
    setFlipped(false);
    setTab("play");
    setNotice("");
  }

  function newLocal() {
    setLocalPgn("");
    localStorage.removeItem("mchess.localPgn");
    startLocal();
  }

  function undoMove() {
    if (mode === "online") return;
    const game = new Chess();
    if (localPgn) game.loadPgn(localPgn);
    if (!game.history().length) return;
    game.undo();
    if (mode === "bot" && game.turn() === "b" && game.history().length) game.undo();
    const pgn = game.pgn();
    setLocalPgn(pgn);
    localStorage.setItem("mchess.localPgn", pgn);
    setMoveBadges([]);
    setMoveKinds({});
    setHintMove(null);
    setDismissedResult(null);
  }

  async function showHint() {
    if (mode !== "bot" || botThinking || local.isGameOver() || local.turn() !== "w") return;
    setHintBusy(true);
    try {
      const fen = local.fen();
      const result = await engine().search(fen, 20, 650);
      if (local.fen() !== fen) return;
      const from = result.move.slice(0, 2) as Square;
      const to = result.move.slice(2, 4) as Square;
      setHintMove({ from, to });
      const copy = new Chess(fen);
      const san = copy.move({ from, to, promotion: result.move[4] || "q" }).san;
      setNotice("Подсказка тренера: " + san + " — посмотрите на выделенные клетки.");
    } catch { setNotice("Не удалось получить подсказку Stockfish."); }
    finally { setHintBusy(false); }
  }

  function move(from: Square, to: Square, promotion?: string) {
    if (mode === "online") {
      if (!connected || !session || online?.turn !== session.seat || online?.result) return;
      const message = { type: "move", from, to, promotion, clientMoveId: crypto.randomUUID() };
      if (hostedApi) void hostedAction(message);
      else socketRef.current?.send(JSON.stringify(message));
      return;
    }
    if (mode === "bot" && (botThinking || local.turn() !== "w")) return;
    try {
      local.move({ from, to, promotion: promotion || "q" });
      playMoveSound();
      setHintMove(null);
      setMoveBadges([]);
      const pgn = local.pgn();
      setLocalPgn(pgn);
      localStorage.setItem("mchess.localPgn", pgn);
    } catch { /* board selection is already constrained to legal moves */ }
  }

  async function copyInvite() {
    if (!session) return;
    const url = Capacitor.isNativePlatform() ? session.roomId : window.location.origin + "/?room=" + session.roomId;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(Capacitor.isNativePlatform() ? "Код комнаты скопирован" : "Ссылка на комнату скопирована");
    } catch {
      setNotice(url);
    }
  }

  function resign() {
    if (mode === "online") { if (hostedApi) void hostedAction({ type: "resign" }); else socketRef.current?.send(JSON.stringify({ type: "resign" })); }
  }

  function drawAction(type: "offer_draw" | "accept_draw" | "decline_draw") {
    if (mode === "online" && connected) { if (hostedApi) void hostedAction({ type }); else socketRef.current?.send(JSON.stringify({ type })); }
  }

  function importPgn() {
    try {
      const game = new Chess();
      game.loadPgn(pgnInput.trim());
      if (!game.history().length) throw new Error("empty");
      setLocalPgn(game.pgn());
      localStorage.setItem("mchess.localPgn", game.pgn());
      setMode("local");
      setSession(null);
      window.history.replaceState({}, "", window.location.pathname);
      setNotice("PGN загружен. Позиция готова к анализу.");
    } catch { setNotice("Не удалось прочитать PGN. Проверьте запись ходов."); }
  }

  function exportPgn() {
    const pgn = mode === "online" ? online?.pgn || "" : localPgn;
    if (!pgn) { setNotice("В партии пока нет ходов."); return; }
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mchess-party.pgn";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onMoveClassified(ply: number, kind: MoveKind, square: string) {
    setMoveBadges(previous => [...previous.filter(item => item.ply % 2 !== ply % 2 && item.ply < ply && item.square !== square), { ply, kind, square: square as Square }]);
    setMoveKinds(previous => previous[ply] === kind ? previous : { ...previous, [ply]: kind });
    if (mode === "online" || reactedPly.current.has(ply)) return;
    reactedPly.current.add(ply);
    if (mode === "bot" && coach === "Мелстрой") {
      if (ply % 2 === 0 || reaction || Date.now() - lastGenericReactionAt.current < 30_000) return;
      const isPositive = ["brilliant", "great", "best", "excellent", "good"].includes(kind);
      const isNegative = ["inaccuracy", "mistake", "blunder", "missed-win"].includes(kind);
      if (isPositive || isNegative) {
        const clips = isPositive ? ["positive-20", "positive-23"] : ["negative-17", "negative-39"];
        const index = isPositive ? positiveReactionIndex.current : negativeReactionIndex.current;
        if (index >= clips.length) return;
        if (isPositive) positiveReactionIndex.current++;
        else negativeReactionIndex.current++;
        lastGenericReactionAt.current = Date.now();
        enqueueReaction(`/assets/reactions/verified/${clips[index]}.webm`);
      }
    } else if (kind === "blunder" || kind === "missed-win") {
      const clip = ["blunder-1", "blunder-2", "blunder-3"][badReactionIndex.current++ % 3];
      enqueueReaction(`/assets/reactions/events/${clip}.mp4`);
    } else if (kind === "brilliant") {
      const played = local.history({ verbose: true })[ply - 1];
      const clip = played?.piece === "r" ? "brilliant-rook" : ["brilliant-1", "brilliant-2"][brilliantReactionIndex.current++ % 2];
      enqueueReaction(`/assets/reactions/events/${clip}.mp4`);
    }
  }

  const board = <ChessBoard fen={currentFen} onMove={move} side={mode === "online" ? session?.seat : mode === "bot" ? "w" : "both"} orientation={orientation} lastMove={lastMove} moveBadges={moveBadges.filter(item => item.ply <= moves.length).map(({ square, kind }) => ({ square, kind }))} hintMove={hintMove} />;
  const coachImage = coaches.find(item => item.name === coach)?.image;
  const playerLine = (color: Seat, bottom: boolean) => (
    <div className="player-line">
      <div className="mini-avatar">{mode === "bot" && color === "b" && coachImage ? <img src={coachImage} alt="" /> : mode === "online" && (color === "w" ? online?.whitePlayer : online?.blackPlayer)?.avatar ? avatarGlyph[(color === "w" ? online?.whitePlayer : online?.blackPlayer)!.avatar] : color === "w" ? "♔" : "♚"}</div>
      <div>
        <strong>{mode === "bot" && color === "b" ? coach : mode === "online" ? (color === "w" ? online?.whitePlayer?.name : online?.blackPlayer?.name) || (color === "w" ? "Белые" : "Чёрные") : color === "w" ? "Белые" : "Чёрные"}</strong>
        <small>{mode === "online" && (color === "w" ? online?.whitePlayer : online?.blackPlayer) ? `${color === "w" ? online?.whitePlayer?.rating : online?.blackPlayer?.rating} Эло${session?.seat === color ? " · Вы" : ""}` : mode === "online" && session?.seat === color ? "Вы" : mode === "online" && color === "b" && !online?.blackJoined ? "Ожидание друга" : mode === "bot" && color === "b" ? (botThinking ? "Думает… · " : "Тренер · ") + botLevels[botLevel] + " Эло" : "Игрок"}</small>
      </div>
      {mode === "online" && online && <span className="clock-pill">{clock(online.clocks[color])}</span>}
      {bottom && <div className="turn-pill">{gameResult ? "Итог " + gameResult : currentFen.split(" ")[1] === "w" ? "Ход белых" : "Ход чёрных"}</div>}
    </div>
  );

  return (
    <div className={"app-shell" + (tab === "play" ? " in-game" : "") + (Capacitor.isNativePlatform() ? " native-platform" : "")}>
      {showIntro && <IntroScreen onFinish={() => setShowIntro(false)} />}
      <header className="topbar">
        <button className="brand" onClick={() => setTab("home")} type="button">{tab === "play" ? <span className="back-arrow">‹</span> : <img className="brand-mark" src="/icon-192.png" alt="" />} MChess</button>
        <div className="header-actions"><NewsCenter apiUrl={apiUrl} introVisible={showIntro} /><button className="header-action" onClick={() => setTab("profile")} type="button" aria-label="Профиль">⚙</button></div>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Закрыть">×</button></div>}

      <main>
        {tab === "home" && (
          <section className="page home-page">
            <button className="profile-strip" onClick={() => setTab("profile")} type="button">
              <div className="avatar">{guest ? avatarGlyph[guest.avatar] : "♞"}</div>
              <div><strong>{guest?.name || "Гость"}</strong><span>{guest ? `${guest.rating} Эло · ${guest.gamesToLeaderboard ? `до таблицы ${guest.gamesToLeaderboard} партий` : "в таблице рейтинга"}` : "Создайте профиль для онлайн-игры"}</span></div>
              <b>›</b>
            </button>
            <ChessBoard fen={currentFen} compact />
            <button className="primary-button" onClick={() => setTab("newgame")}>▶ &nbsp; Играть</button>
            <div className="quick-actions">
              <button onClick={startBot}><span>♟</span> Играть с ботом</button>
              <button onClick={() => void createRoom()}><span>♧</span> Играть с другом</button>
              <button onClick={() => setTab("analysis")}><span>▥</span> Партия</button>
            </div>
            {matchTicket ? <div className="match-search"><strong>Поиск соперника: {searchSeconds} / 30 с</strong><span>Диапазон ±200 Эло. Затем нерейтинговый бот.</span><button onClick={() => void cancelMatch()}>Отменить поиск</button></div> : <button className="primary-button match-button" onClick={() => void findMatch()}>⚔ &nbsp; Онлайн-подбор</button>}
            <div className="join-room"><input aria-label="Код комнаты" placeholder="Код комнаты друга" value={joinCode} onChange={event => setJoinCode(event.target.value.trim())} /><button onClick={() => void joinRoom(joinCode)} disabled={!joinCode}>Войти</button></div>
            <button className="feature-row" onClick={() => setTab("puzzles")}><span className="tile">✥</span><span><strong>Задачи</strong><small>Тренируйте тактику</small></span><b>›</b></button>
            <button className="feature-row" onClick={() => setTab("learn")}><span className="tile gold">♜</span><span><strong>Обучение</strong><small>Пять программ Академии</small></span><b>›</b></button>
            <button className="feature-row" onClick={startLocal}><span className="tile muted">♚</span><span><strong>Последняя партия</strong><small>{moves.length ? moves.length + " полуходов сохранено" : "Начните первую партию"}</small></span><b>›</b></button>
          </section>
        )}

        {tab === "newgame" && (
          <section className="page new-game-page">
            <div className="page-heading"><div><span className="eyebrow">ВЫБОР РЕЖИМА</span><h1>Новая партия</h1></div></div>
            <div className="time-control"><span className="time-icon">◷</span><span><strong>10 минут</strong><small>Онлайн · по 10 минут каждому игроку</small></span></div>
            {matchTicket ? <div className="match-search"><strong>Ищем соперника · {searchSeconds} / 30 с</strong><span>Рейтинг ±200 Эло. Если игрок не найдётся, начнётся партия с ботом.</span><button onClick={() => void cancelMatch()}>Отменить поиск</button></div> : <button className="primary-button new-game-start" onClick={() => void findMatch()}>Начать онлайн-партию</button>}
            <div className="game-options">
              <button onClick={() => void createRoom()}><span className="option-icon">♧</span><span><strong>Играть с другом</strong><small>Создать комнату и отправить приглашение</small></span><b>›</b></button>
              <button onClick={() => setShowJoin(value => !value)}><span className="option-icon">⌁</span><span><strong>Войти по коду</strong><small>Присоединиться к комнате друга</small></span><b>›</b></button>
              {showJoin && <div className="join-room"><input aria-label="Код комнаты" placeholder="Код комнаты друга" value={joinCode} onChange={event => setJoinCode(event.target.value.trim())} /><button onClick={() => void joinRoom(joinCode)} disabled={!joinCode}>Войти</button></div>}
              <button onClick={() => { setCoach("Магнус Карлсен"); startBot(); }}><span className="option-icon">♟</span><span><strong>Играть с ботом</strong><small>Шахматный соперник с выбором Эло</small></span><b>›</b></button>
              <button onClick={startBot}><span className="option-icon">♞</span><span><strong>Играть с тренером</strong><small>{coach} · подсказки и разбор ходов</small></span><b>›</b></button>
              <button onClick={newLocal}><span className="option-icon">♙</span><span><strong>На одном устройстве</strong><small>Партия для двух игроков рядом</small></span><b>›</b></button>
            </div>
            <div className="game-config"><label>Уровень бота и тренера <select value={botLevel} onChange={event => setBotLevel(Number(event.target.value))}>{botLevels.map((level, i) => <option key={level} value={i}>{level} Эло</option>)}</select></label><button onClick={() => setTab("profile")}>Выбрать тренера <span>›</span></button></div>
          </section>
        )}

        {tab === "play" && (
          <section className="page play-page">
            <div className="page-heading"><div><span className="eyebrow">{mode === "online" ? "КОМНАТА " + session?.roomId : mode === "bot" ? "ИГРА С ТРЕНЕРОМ" : "ЛОКАЛЬНАЯ ИГРА"}</span><h1>{mode === "online" ? "Игра с другом" : mode === "bot" ? "Игра с тренером" : "Партия на одном устройстве"}</h1></div><span className={"connection " + (connected ? "online" : "")}>{mode === "online" ? (connected ? "● На связи" : "○ Подключение") : "● Без сети"}</span></div>
            {playerLine(orientation === "w" ? "b" : "w", false)}
            {mode === "bot" && <label className="bot-level">Уровень тренера <select value={botLevel} onChange={event => setBotLevel(Number(event.target.value))}>{botLevels.map((level, i) => <option key={level} value={i}>{level} Эло</option>)}</select></label>}
            {board}
            <LiveEvaluation pgn={localPgn} active={mode !== "online"} onClassified={onMoveClassified} />
            {playerLine(orientation, true)}
            {mode === "online" && <button className="primary-button" onClick={() => void copyInvite()}>{Capacitor.isNativePlatform() ? "Скопировать код комнаты" : "Пригласить по ссылке"}</button>}
            <div className="quick-actions">
              {mode === "bot" ? <><button onClick={undoMove} disabled={!moves.length}>↶ &nbsp; Отмена</button><button onClick={() => void showHint()} disabled={hintBusy || botThinking || currentFen.split(" ")[1] !== "w"}>✦ &nbsp; {hintBusy ? "Думаю…" : "Подсказка"}</button><button onClick={() => setFlipped(value => !value)}>⇅ &nbsp; Доска</button></> : <><button onClick={() => setTab("analysis")}>☰ &nbsp; Ходы</button><button onClick={() => setFlipped(value => !value)}>⇅ &nbsp; Перевернуть</button><button onClick={mode === "online" ? resign : newLocal}>{mode === "online" ? "⚑ Сдаться" : "↺ Новая"}</button></>}
            </div>
            {mode === "bot" && <button className="new-game-button" onClick={startBot}>Новая партия</button>}
            {mode === "online" && !gameResult && <div className="draw-actions">{online?.drawOfferedBy && online.drawOfferedBy !== session?.seat ? <><span>Соперник предлагает ничью</span><button onClick={() => drawAction("accept_draw")}>Принять</button><button onClick={() => drawAction("decline_draw")}>Отклонить</button></> : <button disabled={!online?.blackJoined || Boolean(online?.drawOfferedBy)} onClick={() => drawAction("offer_draw")}>{online?.drawOfferedBy ? "Ничья предложена" : "Предложить ничью"}</button>}</div>}
            <div className="moves-panel"><strong>Ходы партии</strong><div>{moves.length ? moves.map((item, index) => <span key={index}>{index % 2 === 0 ? Math.floor(index / 2) + 1 + ". " : ""}{item} </span>) : <small>Сделайте первый ход</small>}</div></div>
            {gameResult && dismissedResult !== gameResult && <div className={"result-overlay " + resultOutcome} role="dialog" aria-label="Итог партии"><div className="result-card">
              {resultOutcome === "draw" ? <div className="result-emblem">½</div> : <ResultAnimation outcome={resultOutcome} />}
              <h2>{gameResult === "1/2-1/2" ? "Ничья" : mode === "local" ? (gameResult === "1-0" ? "Победа белых" : "Победа чёрных") : playerWon ? "Победа!" : "Поражение"}</h2>
              <p>{gameResult === "1/2-1/2" ? "Равная борьба до конца." : "Посмотрите ходы и разберите ключевые моменты партии."}</p>
              {openingReport && <p className="opening-result"><strong>Дебют:</strong> {openingReport.opening}<br /><strong>Гамбит:</strong> {openingReport.gambit}</p>}
              <div className="result-actions"><button onClick={() => { setDismissedResult(gameResult); setTab("analysis"); }}>Отчёт о партии</button><button onClick={() => setDismissedResult(gameResult)}>Посмотреть доску</button><button onClick={mode === "bot" ? startBot : newLocal}>Новая партия</button></div>
            </div></div>}
          </section>
        )}

        {tab === "analysis" && (
          <section className="page">
            <div className="page-heading"><div><span className="eyebrow">ПАРТИЯ</span><h1>История ходов</h1></div></div>
            {gameResult && <GameReport pgn={mode === "online" ? online?.pgn || "" : localPgn} />}
            <ChessBoard fen={currentFen} compact />
            <div className="card"><h2>Сыгранные ходы</h2><p>{moves.length ? moves.map((item, i) => (i % 2 === 0 ? Math.floor(i / 2) + 1 + ". " : "") + item + " ").join("") : "Партия ещё не началась."}</p></div>
            {gameResult && openingReport && <div className="card"><h2>Дебют и гамбит</h2><p>Дебют: {openingReport.opening}<br />Гамбит: {openingReport.gambit}</p></div>}
            <div className="card"><h2>Анализ Stockfish</h2><p>{mode === "online" && !online?.result ? "Разбор онлайн-партии откроется после её окончания." : analysisBusy ? "Движок анализирует позицию…" : analysis ? `Глубина ${analysis.depth}. Оценка для белых: ${analysis.mate !== null ? "мат " + (currentFen.split(" ")[1] === "w" ? analysis.mate : -analysis.mate) : ((analysis.score ?? 0) * (currentFen.split(" ")[1] === "w" ? 1 : -1) / 100).toFixed(2)}. Лучший ход: ${analysis.move.slice(0, 4)}.` : "Анализ ещё не запущен."}</p></div>
            <div className="card pgn-panel"><h2>PGN партии</h2><textarea aria-label="Текст PGN для импорта" placeholder="Вставьте PGN партии" value={pgnInput} onChange={event => setPgnInput(event.target.value)} /><div><button onClick={importPgn}>Загрузить PGN</button><button onClick={exportPgn}>Скачать PGN</button></div></div>
          </section>
        )}

        {tab === "puzzles" && <Training />}

        {tab === "learn" && <Training lesson />}

        {tab === "profile" && (
          <section className="page profile-page"><div className="profile-hero"><div className="avatar large">{guest ? avatarGlyph[guest.avatar] : "♞"}</div><div><h1>{guest?.name || "Гость"}</h1><p>{guest ? `${guest.rating} Эло · ${guest.ratedGames} рейтинговых партий` : "Выберите уровень и создайте профиль"}<br />Выбранный тренер: {coach}</p></div></div>
            {guest ? <div className="card"><h2>Рейтинг онлайн</h2><p>{guest.gamesToLeaderboard ? `До таблицы рейтинга осталось ${guest.gamesToLeaderboard} партий с людьми.` : "Ваш рейтинг участвует в таблице."}<br />Побед: {guest.wins} · Поражений: {guest.losses} · Ничьих: {guest.draws}</p><button onClick={() => void findMatch()}>Найти соперника</button></div> : <div className="card guest-signup"><h2>Гостевой профиль</h2><input value={guestName} maxLength={24} onChange={event => setGuestName(event.target.value)} placeholder="Ваше имя" aria-label="Ваше имя" /><select value={guestLevel} onChange={event => setGuestLevel(event.target.value as Level)} aria-label="Ваш уровень"><option value="beginner">Начинающий · 400 Эло</option><option value="amateur">Любитель · 1000 Эло</option><option value="experienced">Опытный · 1500 Эло</option><option value="professional">Профессионал · 2000 Эло</option></select><div className="avatar-options" aria-label="Выберите аватар">{(Object.keys(avatarGlyph) as Avatar[]).map(choice => <button className={choice === guestAvatar ? "selected" : ""} type="button" key={choice} onClick={() => setGuestAvatar(choice)} aria-label={`Аватар ${choice}`}>{avatarGlyph[choice]}</button>)}</div><button onClick={() => void registerGuest()}>Создать профиль</button></div>}
            <div className="card leaderboard"><h2>Таблица рейтинга</h2>{leaderboard.length ? leaderboard.map((player, index) => <div key={player.id}><span>{index + 1}. {avatarGlyph[player.avatar]} {player.name}</span><strong>{player.rating} Эло</strong></div>) : <p>Пока нет игроков с десятью рейтинговыми партиями.</p>}</div>
            <h2>Тренеры</h2><p className="section-subtitle">Выберите стиль объяснений и реакций</p>
            <div className="coaches">{coaches.map((item) => <button className={"coach-card " + (coach === item.name ? "active" : "")} key={item.name} onClick={() => { setCoach(item.name); localStorage.setItem("mchess.coach", item.name); }}><img className="coach-image" src={item.image} alt={item.name} /><strong>{item.name}</strong><small>{item.role}</small></button>)}</div>
            <div className="card server-setting"><h2>Онлайн-сервер</h2><p>Для игры через интернет укажите HTTPS-адрес сервера MChess.</p><input type="url" placeholder="https://api.example.com" value={apiUrl} onChange={event => { setApiUrl(event.target.value.replace(/\/$/, "")); localStorage.setItem("mchess.apiUrl", event.target.value.replace(/\/$/, "")); }} aria-label="Адрес онлайн-сервера" /></div>
            <div className="card"><h2>Об игре</h2><p>MChess — шахматы, тренировки и разбор партий.<br />Автор — Ilua Burmalda</p></div>
            <div className="card"><h2>Новости и обновления</h2><p>Анонсы игры публикуются в Telegram-канале.</p><a href="https://t.me/WebIluxa" target="_blank" rel="noopener noreferrer">Открыть @WebIluxa</a></div>
          </section>
        )}
      </main>

      {tab !== "play" && <nav className="bottom-nav" aria-label="Главная навигация">
        {([["home", "⌂", "Главная"], ["newgame", "⚔", "Играть"], ["puzzles", "✥", "Задачи"], ["learn", "▱", "Обучение"], ["profile", "♟", "Профиль"]] as const).map(([key, icon, label]) =>
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span>{icon}</span><small>{label}</small></button>
        )}
      </nav>}
      <CoachReaction clip={reaction} onClose={finishReaction} />
    </div>
  );
}

