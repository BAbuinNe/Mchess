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
import { nextMellstroyClip } from "./mellstroyClips";
import VerifiedBadge from "./VerifiedBadge";
import UIIcon from "./UIIcon";

type Tab = "home" | "newgame" | "play" | "puzzles" | "learn" | "profile" | "analysis";
type Seat = "w" | "b";
type Level = "beginner" | "amateur" | "experienced" | "professional";
type Avatar = "knight" | "queen" | "rook" | "bishop" | "king";
const avatarGlyph: Record<Avatar, string> = { knight: "♞", queen: "♛", rook: "♜", bishop: "♝", king: "♚" };
type GuestProfile = { id: string; name: string; level: Level; avatar: Avatar; rating: number; ratedGames: number; gamesToLeaderboard: number; wins: number; losses: number; draws: number; verified?: boolean };
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
  ratingDelta?: Record<Seat, number> | null;
  whitePlayer?: GuestProfile | null;
  blackPlayer?: GuestProfile | null;
};
type Session = { roomId: string; seat: Seat; seatToken: string };

const DEFAULT_API = window.location.port === "5173" && !Capacitor.isNativePlatform()
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : Capacitor.isNativePlatform() ? "https://mchess-online.onrender.com" : window.location.origin;
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
function storedReactedPlies(gameId: string): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem("mchess.reacted." + gameId) || "[]") as number[]); }
  catch { return new Set(); }
}

export default function App() {
  const [showIntro, setShowIntro] = useState(() => Capacitor.isNativePlatform() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [tab, setTab] = useState<Tab>("home");
  const [localPgn, setLocalPgn] = useState(() => restoreLocal().pgn());
  const [mode, setMode] = useState<"local" | "online" | "bot">(() => localStorage.getItem("mchess.lastLocalMode") === "bot" ? "bot" : "local");
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState<OnlineState | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(timer); }, [notice]);
  const [connected, setConnected] = useState(false);
  const [coach, setCoach] = useState(() => localStorage.getItem("mchess.coach") || "Магнус Карлсен");
  const [botLevel, setBotLevel] = useState(() => Math.max(0, Math.min(botLevels.length - 1, Number(localStorage.getItem("mchess.botLevel") ?? 3) || 0)));
  const [botThinking, setBotThinking] = useState(false);
  const [analysis, setAnalysis] = useState<EngineResult | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoOpponent, setPromoOpponent] = useState(false);
  const reactionQueue = useRef<string[]>([]);
  const reactionActive = useRef(false);
  const [videoEnabled, setVideoEnabled] = useState(() => localStorage.getItem("mchess.videoEnabled") !== "false");
  const [reactionMuted, setReactionMuted] = useState(() => localStorage.getItem("mchess.reactionMuted") === "true");
  const [reactionFrequency, setReactionFrequency] = useState<"often" | "balanced" | "rare">(() => {
    const saved = localStorage.getItem("mchess.reactionFrequency");
    return saved === "balanced" || saved === "rare" ? saved : "often";
  });
  const videoEnabledRef = useRef(videoEnabled);
  videoEnabledRef.current = videoEnabled;
  const [moveKinds, setMoveKinds] = useState<Record<number, MoveKind>>({});
  const [pgnInput, setPgnInput] = useState("");
  const apiUrl = DEFAULT_API;
  const hostedApi = apiUrl.includes(".vercel.app") || apiUrl.includes(".onrender.com");
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
  const pendingOnlineMove = useRef<number | null>(null);
  useEffect(() => { pendingOnlineMove.current = null; }, [session?.roomId]);
  const badReactionIndex = useRef(0);
  const brilliantReactionIndex = useRef(0);
  const rookReactionIndex = useRef(0);
  const cleanReactionIndex = useRef(0);
  const cleanReactionShown = useRef(false);
  const lastGenericReactionAt = useRef(0);
  const winReactionShown = useRef(false);
  const localGameId = useRef(localStorage.getItem("mchess.localGameId") || crypto.randomUUID());
  const reactedPly = useRef(storedReactedPlies(localGameId.current));

  useEffect(() => {
    if (mode !== "online" || !session || !online?.blackJoined) return;
    const rival = session.seat === "w" ? online.blackPlayer : online.whitePlayer;
    const key = "mchess.promoSeen.v2." + session.roomId;
    if (rival?.verified && !localStorage.getItem(key) && !promoOpponent) setPromoOpponent(true);
  }, [mode, session, promoOpponent, online?.blackJoined, online?.whitePlayer?.verified, online?.blackPlayer?.verified]);

  useEffect(() => { if (mode !== "online") localStorage.setItem("mchess.lastLocalMode", mode); }, [mode]);
  useEffect(() => { localStorage.setItem("mchess.botLevel", String(botLevel)); }, [botLevel]);
  useEffect(() => { localStorage.setItem("mchess.localGameId", localGameId.current); }, []);
  useEffect(() => { localStorage.setItem("mchess.videoEnabled", String(videoEnabled)); if (!videoEnabled) { reactionActive.current = false; reactionQueue.current = []; setReaction(null); } }, [videoEnabled]);
  useEffect(() => { localStorage.setItem("mchess.reactionMuted", String(reactionMuted)); }, [reactionMuted]);
  useEffect(() => { localStorage.setItem("mchess.reactionFrequency", reactionFrequency); }, [reactionFrequency]);

  function enqueueReaction(clip: string, priority = false) {
    if (!videoEnabledRef.current) return;
    if (!reactionActive.current) { reactionActive.current = true; setReaction(clip); }
    else if (priority) { reactionQueue.current.unshift(clip); reactionQueue.current.length = Math.min(3, reactionQueue.current.length); }
    else if (reactionQueue.current.length < 3) reactionQueue.current.push(clip);
  }
  function resetReactionHistory() {
    localGameId.current = crypto.randomUUID();
    localStorage.setItem("mchess.localGameId", localGameId.current);
    reactedPly.current.clear();
    winReactionShown.current = false;
    cleanReactionShown.current = false;
    lastGenericReactionAt.current = 0;
    reactionQueue.current = [];
    reactionActive.current = false;
    setReaction(null);
  }
  function finishReaction() {
    const next = reactionQueue.current.shift() ?? null;
    reactionActive.current = Boolean(next);
    setReaction(next);
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
    return () => { active = false; setBotThinking(false); };
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
    if (mode === "online" || !gameResult || gameResult === "1/2-1/2" || winReactionShown.current) return;
    const winningParity = gameResult === "1-0" ? 1 : 0;
    const brilliantCount = Object.entries(moveKinds).filter(([ply, kind]) => kind === "brilliant" && Number(ply) % 2 === winningParity).length;
    if (brilliantCount < 2) return;
    const timer = window.setTimeout(() => {
      winReactionShown.current = true;
      enqueueReaction("/assets/reactions/events/brilliant-win.mp4", true);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [mode, coach, gameResult, moveKinds]);

  useEffect(() => {
    if (mode === "online" || !gameResult || cleanReactionShown.current || winReactionShown.current) return;
    const humanPlies = moves.map((_, index) => index + 1).filter(ply => mode !== "bot" || ply % 2 === 1);
    if (humanPlies.length < 8 || humanPlies.some(ply => !moveKinds[ply])) return;
    if (humanPlies.some(ply => ["mistake", "blunder", "missed-win"].includes(moveKinds[ply]))) return;
    cleanReactionShown.current = true;
    const clip = ["clean-game-1", "clean-game-2"][cleanReactionIndex.current++ % 2];
    enqueueReaction(`/assets/reactions/events/${clip}.mp4`, true);
  }, [mode, gameResult, moves.length, moveKinds]);

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
      let refreshing = false;
      const refresh = async () => {
        if (refreshing) return;
        refreshing = true;
        try {
          const response = await fetch(apiUrl + "/api/rooms/" + encodeURIComponent(session.roomId), { cache: "no-store" });
          if (!response.ok) throw new Error("room_unavailable");
          const state = await response.json() as OnlineState;
          if (!active) return;
          const pending = pendingOnlineMove.current;
          if (pending !== null && state.moves.length <= pending) { setConnected(true); return; }
          if (state.moves.length > (onlineRef.current?.moves.length ?? state.moves.length) && (pending === null || state.moves.length > pending + 1)) playMoveSound();
          if (pending !== null) pendingOnlineMove.current = null;
          onlineRef.current = state;
          setOnline(state);
          setConnected(true);
        } catch { if (active) setConnected(false); }
        finally { refreshing = false; }
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
      pendingOnlineMove.current = null;
      if (data.moves.length >= (onlineRef.current?.moves.length ?? 0)) { onlineRef.current = data; setOnline(data); }
    } catch (error) {
      pendingOnlineMove.current = null;
      if (onlineRef.current) setOnline(onlineRef.current);
      setNotice("Ход не принят сервером: " + (error instanceof Error ? error.message : "ошибка сети"));
    }
  }

  useEffect(() => {
    if (mode !== "bot" || local.turn() !== "b" || local.isGameOver()) return;
    let active = true;
    const fen = local.fen();
    const startedThinking = performance.now();
    setBotThinking(true);
    void engine("play").search(fen, Math.round(botLevel * 20 / 11), 450).then(async result => {
      await new Promise(resolve => window.setTimeout(resolve, Math.max(0, 3000 - (performance.now() - startedThinking))));
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

  async function redeemPromo() {
    if (!guestToken) { setNotice("Сначала создайте гостевой профиль."); return; }
    try {
      const response = await fetch(apiUrl + "/api/me/promo", { method: "POST", headers: { Authorization: `Bearer ${guestToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode }) });
      if (!response.ok) throw new Error("invalid_promo");
      setGuest(await response.json() as GuestProfile);
      setPromoCode("");
      setNotice("Промокод активирован: значок добавлен к нику.");
    } catch { setNotice("Промокод не принят. Проверьте ввод и соединение."); }
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
    cleanReactionShown.current = false;
  }

  function startBot() {
    if (matchTicket) void cancelMatch();
    setLocalPgn("");
    localStorage.removeItem("mchess.localPgn");
    window.history.replaceState({}, "", window.location.pathname);
    setSession(null);
    setOnline(null);
    setMode("bot");
    setBotThinking(false);
    setMoveBadges([]);
    setMoveKinds({});
    winReactionShown.current = false;
    cleanReactionShown.current = false;
    resetReactionHistory();
    setHintMove(null);
    setDismissedResult(null);
    setFlipped(false);
    setTab("play");
    setNotice("");
  }

  function newLocal() {
    setLocalPgn("");
    localStorage.removeItem("mchess.localPgn");
    resetReactionHistory();
    startLocal();
  }

  function undoMove() {
    if (mode === "online") return;
    const game = new Chess();
    if (localPgn) game.loadPgn(localPgn);
    if (!game.history().length) return;
    setBotThinking(false);
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
      if (!connected || !session || !online || online.turn !== session.seat || online.result || pendingOnlineMove.current !== null) return;
      const message = { type: "move", from, to, promotion, clientMoveId: crypto.randomUUID() };
      if (hostedApi) {
        try {
          const game = new Chess();
          if (online.pgn) game.loadPgn(online.pgn);
          game.move({ from, to, promotion: promotion || "q" });
          pendingOnlineMove.current = online.moves.length;
          setOnline({ ...online, fen: game.fen(), pgn: game.pgn(), moves: game.history(), turn: game.turn(), check: game.isCheck() });
          playMoveSound();
          void hostedAction(message);
        } catch { setNotice("Недопустимый ход"); }
      }
      else socketRef.current?.send(JSON.stringify(message));
      return;
    }
    if (mode === "bot" && (botThinking || local.turn() !== "w")) return;
    try {
      const checkedBefore = local.isCheck();
      const movingPiece = local.get(from)?.type;
      local.move({ from, to, promotion: promotion || "q" });
      playMoveSound();
      setHintMove(null);
      setMoveBadges([]);
      const pgn = local.pgn();
      setLocalPgn(pgn);
      localStorage.setItem("mchess.localPgn", pgn);
      if (checkedBefore && movingPiece !== "k" && !local.isCheck()) enqueueReaction("/assets/reactions/events/check-block.mp4", true);
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
      resetReactionHistory();
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

  function onMoveClassified(ply: number, kind: MoveKind, square: string, piece: string) {
    if (mode === "online" && (!session || ply % 2 !== (session.seat === "w" ? 1 : 0))) return;
    setMoveBadges(previous => [...previous.filter(item => item.ply % 2 !== ply % 2 && item.ply < ply && item.square !== square), { ply, kind, square: square as Square }]);
    setMoveKinds(previous => previous[ply] === kind ? previous : { ...previous, [ply]: kind });
    if ((mode === "online" && ply !== moves.length) || (mode === "bot" && ply % 2 === 0) || reactedPly.current.has(ply)) return;
    reactedPly.current.add(ply);
    localStorage.setItem("mchess.reacted." + localGameId.current, JSON.stringify([...reactedPly.current]));
    if (kind === "blunder" || kind === "missed-win") {
      const clip = ["blunder-1", "blunder-2", "blunder-3", "blunder-new"][badReactionIndex.current++ % 4];
      enqueueReaction(`/assets/reactions/events/${clip}.mp4`, true);
    } else if (kind === "brilliant") {
      const clip = piece === "r"
        ? ["brilliant-rook", "brilliant-rook-new"][rookReactionIndex.current++ % 2]
        : ["brilliant-1", "brilliant-2", "brilliant-new-1", "brilliant-new-2"][brilliantReactionIndex.current++ % 4];
      enqueueReaction(`/assets/reactions/events/${clip}.mp4`, true);
    } else if (mode === "bot" && coach === "Мелстрой") {
      const cooldown = reactionFrequency === "rare" ? 20_000 : reactionFrequency === "balanced" ? 8_000 : 1_500;
      if (Date.now() - lastGenericReactionAt.current < cooldown) return;
      if (reactionActive.current && reactionQueue.current.length >= 3) return;
      lastGenericReactionAt.current = Date.now();
      enqueueReaction(nextMellstroyClip(kind));
    }
  }

  const board = <ChessBoard fen={currentFen} onMove={move} side={mode === "online" ? session?.seat : mode === "bot" ? "w" : "both"} orientation={orientation} lastMove={lastMove} moveBadges={moveBadges.filter(item => item.ply <= moves.length).map(({ square, kind }) => ({ square, kind }))} hintMove={hintMove} />;
  const coachImage = coaches.find(item => item.name === coach)?.image;
  const playerLine = (color: Seat, bottom: boolean) => (
    <div className="player-line">
      <div className="mini-avatar">{mode === "bot" && color === "b" && coachImage ? <img src={coachImage} alt="" /> : mode === "online" && (color === "w" ? online?.whitePlayer : online?.blackPlayer)?.avatar ? avatarGlyph[(color === "w" ? online?.whitePlayer : online?.blackPlayer)!.avatar] : color === "w" ? "♔" : "♚"}</div>
      <div>
        <div className="verified-name"><strong>{mode === "bot" && color === "b" ? coach : mode === "online" ? ((color === "w" ? online?.whitePlayer?.name : online?.blackPlayer?.name) || (color === "w" ? "Белые" : "Чёрные")) : color === "w" ? "Белые" : "Чёрные"}</strong>{mode === "online" && (color === "w" ? online?.whitePlayer?.verified : online?.blackPlayer?.verified) && <VerifiedBadge self={session?.seat === color} />}</div>
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
        <div className="header-actions"><NewsCenter apiUrl={apiUrl} introVisible={showIntro} /><button className="header-action" onClick={() => setTab("profile")} type="button" aria-label="Профиль"><UIIcon name="settings" /></button></div>
      </header>

      {notice && <div className={"notice " + (/не удалось|ошибк|недопустим|отклонён|недоступен/i.test(notice) ? "notice-error" : /ищем|подключ|ожидан/i.test(notice) ? "notice-info" : "notice-success")} role="status">{notice}<button onClick={() => setNotice("")} aria-label="Закрыть">×</button></div>}

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
              <button onClick={startBot}><UIIcon name="bot" /> Играть с ботом</button>
              <button onClick={() => void createRoom()}><UIIcon name="friends" /> Играть с другом</button>
              <button onClick={() => setTab("analysis")}><UIIcon name="board" /> Партия</button>
            </div>
            {matchTicket ? <div className="match-search"><strong>Поиск соперника: {searchSeconds} / 30 с</strong><span>Диапазон ±200 Эло. Затем нерейтинговый бот.</span><button onClick={() => void cancelMatch()}>Отменить поиск</button></div> : <button className="primary-button match-button" onClick={() => void findMatch()}>⚔ &nbsp; Онлайн-подбор</button>}
            <div className="join-room"><input aria-label="Код комнаты" placeholder="Код комнаты друга" value={joinCode} onChange={event => setJoinCode(event.target.value.trim())} /><button onClick={() => void joinRoom(joinCode)} disabled={!joinCode}>Войти</button></div>
            <button className="feature-row" onClick={() => setTab("puzzles")}><span className="tile">✥</span><span><strong>Задачи</strong><small>Тренируйте тактику</small></span><b>›</b></button>
            <button className="feature-row" onClick={() => setTab("learn")}><span className="tile gold">♜</span><span><strong>Обучение</strong><small>Пять программ Академии</small></span><b>›</b></button>
            <button className="feature-row" onClick={() => setTab("play")}><span className="tile muted">♚</span><span><strong>Последняя партия</strong><small>{moves.length ? moves.length + " полуходов сохранено" : "Начните первую партию"}</small></span><b>›</b></button>
          </section>
        )}

        {tab === "newgame" && (
          <section className="page new-game-page">
            <div className="page-heading"><div><span className="eyebrow">ВЫБОР РЕЖИМА</span><h1>Новая партия</h1></div></div>
            <div className="time-control"><span className="time-icon">◷</span><span><strong>10 минут</strong><small>Онлайн · по 10 минут каждому игроку</small></span></div>
            {matchTicket ? <div className="match-search"><strong>Ищем соперника · {searchSeconds} / 30 с</strong><span>Рейтинг ±200 Эло. Если игрок не найдётся, начнётся партия с ботом.</span><button onClick={() => void cancelMatch()}>Отменить поиск</button></div> : <button className="primary-button new-game-start" onClick={() => void findMatch()}>Начать онлайн-партию</button>}
            <div className="game-options">
              <button onClick={() => void createRoom()}><span className="option-icon"><UIIcon name="friends" size={28} /></span><span><strong>Играть с другом</strong><small>Создать комнату и отправить приглашение</small></span><b>›</b></button>
              <button onClick={() => setShowJoin(value => !value)}><span className="option-icon"><UIIcon name="play" size={28} /></span><span><strong>Войти по коду</strong><small>Присоединиться к комнате друга</small></span><b>›</b></button>
              {showJoin && <div className="join-room"><input aria-label="Код комнаты" placeholder="Код комнаты друга" value={joinCode} onChange={event => setJoinCode(event.target.value.trim())} /><button onClick={() => void joinRoom(joinCode)} disabled={!joinCode}>Войти</button></div>}
              <button onClick={() => { setCoach("Магнус Карлсен"); startBot(); }}><span className="option-icon"><UIIcon name="bot" size={28} /></span><span><strong>Играть с ботом</strong><small>Шахматный соперник с выбором Эло</small></span><b>›</b></button>
              <button onClick={startBot}><span className="option-icon"><UIIcon name="coach" size={28} /></span><span><strong>Играть с тренером</strong><small>{coach} · подсказки и разбор ходов</small></span><b>›</b></button>
              <button onClick={newLocal}><span className="option-icon"><UIIcon name="board" size={28} /></span><span><strong>На одном устройстве</strong><small>Партия для двух игроков рядом</small></span><b>›</b></button>
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
            <LiveEvaluation key={mode === "online" ? `${session?.roomId || ""}:${session?.seat || ""}` : "local"} pgn={mode === "online" ? online?.pgn || "" : localPgn} active={mode !== "online" || Boolean(session)} onlyColor={mode === "online" ? session?.seat : undefined} showPanel={mode !== "online"} onClassified={onMoveClassified} />
            {playerLine(orientation, true)}
            {mode === "online" && <button className="primary-button" onClick={() => void copyInvite()}>{Capacitor.isNativePlatform() ? "Скопировать код комнаты" : "Пригласить по ссылке"}</button>}
            <div className="quick-actions">
              {mode === "bot" ? <><button onClick={undoMove} disabled={!moves.length}>↶ &nbsp; Отмена</button><button onClick={() => void showHint()} disabled={hintBusy || botThinking || currentFen.split(" ")[1] !== "w"}>✦ &nbsp; {hintBusy ? "Думаю…" : "Подсказка"}</button><button onClick={() => setFlipped(value => !value)}>⇅ &nbsp; Доска</button></> : <><button onClick={() => setTab("analysis")}>☰ &nbsp; Ходы</button><button onClick={() => setFlipped(value => !value)}>⇅ &nbsp; Перевернуть</button><button onClick={mode === "online" ? resign : newLocal}>{mode === "online" ? "⚑ Сдаться" : "↺ Новая"}</button></>}
            </div>
            {mode === "bot" && <button className="new-game-button" onClick={startBot}>Новая партия</button>}
            {mode === "online" && !gameResult && <div className="draw-actions">{online?.drawOfferedBy === session?.seat ? <span>Ожидаем ответ на предложение ничьей</span> : !online?.drawOfferedBy ? <button disabled={!online?.blackJoined} onClick={() => drawAction("offer_draw")}>Предложить ничью</button> : null}</div>}
            {mode === "online" && !gameResult && online?.drawOfferedBy && online.drawOfferedBy !== session?.seat && <div className="decision-overlay" role="dialog" aria-modal="true" aria-label="Предложение ничьей"><div className="decision-card"><div className="decision-symbol">½</div><h2>Соперник предлагает ничью</h2><p>Партия завершится с результатом ½–½, если вы согласитесь.</p><div className="decision-actions"><button onClick={() => drawAction("decline_draw")}>Продолжить игру</button><button className="decision-primary" onClick={() => drawAction("accept_draw")}>Принять ничью</button></div></div></div>}
            <div className="moves-panel"><strong>Ходы партии</strong><div>{moves.length ? moves.map((item, index) => <span key={index}>{index % 2 === 0 ? Math.floor(index / 2) + 1 + ". " : ""}{item} </span>) : <small>Сделайте первый ход</small>}</div></div>
            {gameResult && dismissedResult !== gameResult && <div className={"result-overlay " + resultOutcome} role="dialog" aria-label="Итог партии"><div className="result-card">
              {resultOutcome === "draw" ? <div className="result-emblem">½</div> : <ResultAnimation outcome={resultOutcome} />}
              <h2>{gameResult === "1/2-1/2" ? "Ничья" : mode === "local" ? (gameResult === "1-0" ? "Победа белых" : "Победа чёрных") : playerWon ? "Победа!" : "Поражение"}</h2>
              <p>{gameResult === "1/2-1/2" ? "Равная борьба до конца." : "Посмотрите ходы и разберите ключевые моменты партии."}</p>
              {mode === "online" && online?.rated && online.ratingDelta && session && <p className="rating-change">Рейтинг: {online.ratingDelta[session.seat] >= 0 ? "+" : ""}{online.ratingDelta[session.seat]} Эло</p>}
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
          <section className="page profile-page"><div className="profile-hero"><div className="avatar large">{guest ? avatarGlyph[guest.avatar] : "♞"}</div><div><div className="verified-name"><h1>{guest?.name || "Гость"}</h1>{guest?.verified && <VerifiedBadge self />}</div><p>{guest ? `${guest.rating} Эло · ${guest.ratedGames} рейтинговых партий` : "Выберите уровень и создайте профиль"}<br />Выбранный тренер: {coach}</p></div></div>
            {guest ? <div className="card"><h2>Рейтинг онлайн</h2><p>{guest.gamesToLeaderboard ? `До таблицы рейтинга осталось ${guest.gamesToLeaderboard} партий с людьми.` : "Ваш рейтинг участвует в таблице."}<br />Побед: {guest.wins} · Поражений: {guest.losses} · Ничьих: {guest.draws}</p><button onClick={() => void findMatch()}>Найти соперника</button></div> : <div className="card guest-signup"><h2>Гостевой профиль</h2><input value={guestName} maxLength={24} onChange={event => setGuestName(event.target.value)} placeholder="Ваше имя" aria-label="Ваше имя" /><select value={guestLevel} onChange={event => setGuestLevel(event.target.value as Level)} aria-label="Ваш уровень"><option value="beginner">Начинающий · 400 Эло</option><option value="amateur">Любитель · 1000 Эло</option><option value="experienced">Опытный · 1500 Эло</option><option value="professional">Профессионал · 2000 Эло</option></select><div className="avatar-options" aria-label="Выберите аватар">{(Object.keys(avatarGlyph) as Avatar[]).map(choice => <button className={choice === guestAvatar ? "selected" : ""} type="button" key={choice} onClick={() => setGuestAvatar(choice)} aria-label={`Аватар ${choice}`}>{avatarGlyph[choice]}</button>)}</div><button onClick={() => void registerGuest()}>Создать профиль</button></div>}
            <div className="card leaderboard"><h2>Таблица рейтинга</h2>{leaderboard.length ? leaderboard.map((player, index) => <div key={player.id}><span>{index + 1}. {avatarGlyph[player.avatar]} {player.name}</span><strong>{player.rating} Эло</strong></div>) : <p>Пока нет игроков с десятью рейтинговыми партиями.</p>}</div>
            <h2>Тренеры</h2><p className="section-subtitle">Выберите стиль объяснений и реакций</p>
            <div className="coaches">{coaches.map((item) => <button className={"coach-card " + (coach === item.name ? "active" : "")} key={item.name} onClick={() => { setCoach(item.name); localStorage.setItem("mchess.coach", item.name); }}><img className="coach-image" src={item.image} alt={item.name} /><strong>{item.name}</strong><small>{item.role}</small></button>)}</div>
            <div className="card media-settings"><h2>Видео и звук</h2><label><input type="checkbox" checked={videoEnabled} onChange={event => setVideoEnabled(event.target.checked)} /> Показывать видеореакции</label><label><input type="checkbox" checked={reactionMuted} onChange={event => setReactionMuted(event.target.checked)} /> Без звука</label><label>Частота реакций Мелстроя <select value={reactionFrequency} onChange={event => setReactionFrequency(event.target.value as "often" | "balanced" | "rare")} disabled={!videoEnabled}><option value="often">Часто</option><option value="balanced">Умеренно</option><option value="rare">Редко</option></select></label></div>
            <div className="card promo-setting"><h2>Промокод</h2><input value={promoCode} onChange={event => setPromoCode(event.target.value)} placeholder="Введите промокод" aria-label="Промокод" /><button onClick={() => void redeemPromo()}>Применить</button>{guest?.verified && <p>Значок возле ника активирован ✓</p>}</div>
            <div className="card"><h2>Об игре</h2><p>MChess — шахматы, тренировки и разбор партий.<br />Автор — Ilua Burmalda</p></div>
            <div className="card"><h2>Новости и обновления</h2><p>Анонсы игры публикуются в Telegram-канале.</p><a href="https://t.me/WebIluxa" target="_blank" rel="noopener noreferrer">Открыть @WebIluxa</a></div>
          </section>
        )}
      </main>

      {tab !== "play" && <nav className="bottom-nav" aria-label="Главная навигация">
        {([["home", "home", "Главная"], ["newgame", "play", "Играть"], ["puzzles", "puzzles", "Задачи"], ["learn", "learn", "Обучение"], ["profile", "profile", "Профиль"]] as const).map(([key, icon, label]) =>
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><UIIcon name={icon} /><small>{label}</small></button>
        )}
      </nav>}
      <CoachReaction clip={promoOpponent ? "/assets/reactions/events/promo-opponent.mp4?v=2" : reaction} muted={reactionMuted} unskippable={promoOpponent} onPlayed={() => { if (promoOpponent && session) localStorage.setItem("mchess.promoSeen.v2." + session.roomId, "1"); }} onClose={() => { if (promoOpponent) setPromoOpponent(false); else finishReaction(); }} />
    </div>
  );
}

