import { useEffect, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import { engine, type EngineResult } from "./engine";
import MoveIcon from "./MoveIcon";
import { isBookLine, loadOpeningBook } from "./openingBook";

export type MoveKind = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder" | "missed-win";
type Evaluation = { score: number | null; kind: MoveKind; san: string; depth: number; moveNumber: number };
const positionCache = new Map<string, EngineResult>();

async function evaluatePosition(fen: string) {
  const cached = positionCache.get(fen);
  if (cached) return cached;
  const result = await engine().search(fen, 20, 650);
  if (result.depth >= 10 && (result.score !== null || result.mate !== null)) {
    if (positionCache.size >= 256) positionCache.delete(positionCache.keys().next().value!);
    positionCache.set(fen, result);
  }
  return result;
}

export const labels: Record<MoveKind, string> = {
  brilliant: "Бриллиантовый", great: "Замечательный", best: "Лучший", excellent: "Отличный", good: "Хороший", book: "Теория",
  inaccuracy: "Неточность", mistake: "Ошибка", blunder: "Зевок", "missed-win": "Упущенная победа"
};
export const marks: Record<MoveKind, string> = {
  brilliant: "!!", great: "!", best: "★", excellent: "👍", good: "✓", book: "▣",
  inaccuracy: "?!", mistake: "?", blunder: "??", "missed-win": "×"
};

function centipawns(result: EngineResult) {
  return result.mate !== null ? Math.sign(result.mate) * (10000 - Math.abs(result.mate) * 100) : result.score ?? 0;
}

// Lichess's public evaluation-to-win-chance curve keeps a 150 cp change in a
// won position from being treated like the same change in an equal position.
function winChance(cp: number) { return 100 / (1 + Math.exp(-0.00368208 * cp)); }

function sacrifice(game: Chess, move: Move) {
  const pieceValue: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  if (pieceValue[move.piece] < 3) return false;
  const after = new Chess(game.fen());
  const replies = after.moves({ verbose: true });
  return replies.some(reply => reply.to === move.to && Boolean(reply.captured) && pieceValue[reply.piece] < pieceValue[move.piece]);
}

export function classify(before: EngineResult, after: EngineResult, move: Move, game: Chess): MoveKind {
  const expected = centipawns(before);
  const actual = -centipawns(after);
  const loss = Math.max(0, winChance(expected) - winChance(actual));
  const centipawnLoss = Math.max(0, expected - actual);
  const uci = move.from + move.to + (move.promotion || "");
  const engineBest = uci === before.move;
  if (before.mate !== null && before.mate > 0 && after.mate === null) return "missed-win";
  if (loss >= 20 || centipawnLoss >= 450 || (!engineBest && move.piece === "q" && sacrifice(game, move) && centipawnLoss >= 120)) return "blunder";
  if (loss >= 10 || centipawnLoss >= 220) return "mistake";
  if (loss >= 5 || centipawnLoss >= 100) return "inaccuracy";
  if (engineBest && before.depth >= 14 && after.depth >= 14 && sacrifice(game, move) && loss <= 1 && winChance(actual) >= 40) return "brilliant";
  if (engineBest && loss <= 1.5) return "best";
  if (loss <= 2) return "excellent";
  return "good";
}

export default function LiveEvaluation({ pgn, active, onClassified }: { pgn: string; active: boolean; onClassified?: (ply: number, kind: MoveKind, square: string, piece: string) => void }) {
  const [value, setValue] = useState<Evaluation | null>(null);
  const [history, setHistory] = useState<Record<number, Evaluation>>({});
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const scheduled = useRef(new Set<number>());
  const previousMoves = useRef<string[]>([]);
  const running = useRef(0);

  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    generation.current += 1;
    scheduled.current.clear();
    previousMoves.current = [];
    running.current = 0;
    setHistory({});
    setValue(null);
  }, [active]);

  useEffect(() => {
    if (!active || !pgn) {
      generation.current += 1;
      scheduled.current.clear();
      previousMoves.current = [];
      running.current = 0;
      setHistory({});
      setValue(null);
      setBusy(false);
      return;
    }
    const game = new Chess();
    try { game.loadPgn(pgn); } catch { return; }
    const moves = game.history({ verbose: true });
    const san = moves.map(move => move.san);
    const changedLine = previousMoves.current.length > san.length || previousMoves.current.some((move, index) => san[index] !== move);
    if (changedLine) {
      generation.current += 1;
      scheduled.current.clear();
      running.current = 0;
      setHistory({});
      setValue(null);
    }
    previousMoves.current = san;
    const currentGeneration = generation.current;
    const replay = new Chess();
    for (let index = 0; index < moves.length; index++) {
      const beforeFen = replay.fen();
      replay.move(moves[index].san);
      if (index < moves.length - 2 || scheduled.current.has(index + 1)) continue;
      const afterFen = replay.fen();
      const move = moves[index];
      const ply = index + 1;
      scheduled.current.add(ply);
      running.current += 1;
      setBusy(true);
      void (async () => {
        const entries = await loadOpeningBook().catch(() => []);
        const isBook = isBookLine(san.slice(0, ply), entries);
        if (isBook) {
          const result: Evaluation = { score: null, kind: "book", san: move.san, depth: 0, moveNumber: ply };
          if (currentGeneration !== generation.current) return;
          setHistory(previous => ({ ...previous, [ply]: result }));
          setValue(previous => previous && previous.moveNumber > ply ? previous : result);
          onClassified?.(ply, "book", move.to, move.piece);
          return;
        }
        const before = await evaluatePosition(beforeFen);
        const after = await evaluatePosition(afterFen);
        if (currentGeneration !== generation.current) return;
        if ((before.score === null && before.mate === null) || before.depth < 10 || (after.score === null && after.mate === null) || after.depth < 10) return;
        const result = { score: (move.color === "w" ? -1 : 1) * centipawns(after), kind: classify(before, after, move, new Chess(afterFen)), san: move.san, depth: Math.min(before.depth, after.depth), moveNumber: ply };
        setHistory(previous => ({ ...previous, [ply]: result }));
        setValue(previous => previous && previous.moveNumber > ply ? previous : result);
        onClassified?.(ply, result.kind, move.to, move.piece);
      })().catch(() => { if (currentGeneration === generation.current) scheduled.current.delete(ply); })
        .finally(() => { if (currentGeneration === generation.current) { running.current -= 1; setBusy(running.current > 0); } });
    }
  }, [pgn, active]);

  if (!active) return null;
  const score = value?.score ?? 0;
  const whiteShare = Math.max(5, Math.min(95, 50 + 45 * Math.tanh(score / 400)));
  return <div className="live-evaluation" aria-live="polite">
    <div className="eval-summary"><div className="eval-row"><strong>Оценка позиции</strong><span>{busy ? "Анализ…" : value?.score === null ? "Оценка уточняется" : value ? (score >= 0 ? "+" : "") + (score / 100).toFixed(2) + " за белых" : "Равная позиция"}</span></div>
      <div className="eval-track" role="meter" aria-label="Преимущество белых" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(whiteShare)}><div style={{ width: whiteShare + "%" }} /></div></div>
    <div className="eval-detail">{value && <div className="move-feedback"><MoveIcon kind={value.kind} /><strong>{value.san} — {labels[value.kind]}</strong><small>{value.kind === "book" ? "Подтверждено базой дебютов" : `Глубина ${value.depth}`} · ход {value.moveNumber}</small></div>}
      {Object.keys(history).length > 0 && <div className="evaluated-moves" aria-label="Оценка ходов">{Object.values(history).sort((a, b) => a.moveNumber - b.moveNumber).map(item => <span key={item.moveNumber} title={labels[item.kind]}><b>{Math.ceil(item.moveNumber / 2)}{item.moveNumber % 2 ? "." : "..."}</b> {item.san} <MoveIcon kind={item.kind} size={19} /></span>)}</div>}</div>
  </div>;
}

