import { useEffect, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import { engine, type EngineResult } from "./engine";
import MoveIcon from "./MoveIcon";
import { isBookLine, loadOpeningBook } from "./openingBook";

export type MoveKind = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder" | "missed-win";
type Evaluation = { score: number; kind: MoveKind; san: string; depth: number; moveNumber: number };

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
  const uci = move.from + move.to + (move.promotion || "");
  const engineBest = uci === before.move;
  if (before.mate !== null && before.mate > 0 && after.mate === null && loss >= 8) return "missed-win";
  if (loss >= 25) return "blunder";
  if (loss >= 12) return "mistake";
  if (loss >= 5) return "inaccuracy";
  if (engineBest && before.depth >= 18 && after.depth >= 18 && sacrifice(game, move) && loss <= 1 && winChance(actual) >= 40) return "brilliant";
  if (engineBest && loss <= 1.5) return "best";
  if (loss <= 2) return "excellent";
  return "good";
}

export default function LiveEvaluation({ pgn, active, onClassified }: { pgn: string; active: boolean; onClassified?: (ply: number, kind: MoveKind, square: string) => void }) {
  const [value, setValue] = useState<Evaluation | null>(null);
  const [history, setHistory] = useState<Record<number, Evaluation>>({});
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    generation.current += 1;
    setHistory({});
    setValue(null);
  }, [active]);

  useEffect(() => {
    if (!active || !pgn) { generation.current += 1; setValue(null); setBusy(false); return; }
    const game = new Chess();
    try { game.loadPgn(pgn); } catch { return; }
    const history = game.history({ verbose: true });
    const move = history.at(-1);
    if (!move) return;
    const afterFen = game.fen();
    game.undo();
    const beforeFen = game.fen();
    const currentGeneration = generation.current;
    setBusy(true);
    void (async () => {
      const entries = await loadOpeningBook().catch(() => []);
      const isBook = isBookLine(history.map(item => item.san), entries);
      const before = await engine().search(beforeFen, 20, 650);
      const after = await engine().search(afterFen, 20, 650);
      if (currentGeneration !== generation.current) return;
      if ((before.score === null && before.mate === null) || (after.score === null && after.mate === null) || Math.min(before.depth, after.depth) < 10) return;
      const result = { score: (move.color === "w" ? -1 : 1) * centipawns(after), kind: isBook ? "book" as const : classify(before, after, move, new Chess(afterFen)), san: move.san, depth: Math.min(before.depth, after.depth), moveNumber: history.length };
      setHistory(previous => ({ ...previous, [result.moveNumber]: result }));
      setValue(previous => previous && previous.moveNumber > result.moveNumber ? previous : result);
      onClassified?.(result.moveNumber, result.kind, move.to);
    })().catch(() => {}).finally(() => { if (currentGeneration === generation.current) setBusy(false); });
  }, [pgn, active]);

  if (!active) return null;
  const score = value?.score ?? 0;
  const whiteShare = Math.max(5, Math.min(95, 50 + 45 * Math.tanh(score / 400)));
  return <div className="live-evaluation" aria-live="polite">
    <div className="eval-summary"><div className="eval-row"><strong>Оценка позиции</strong><span>{busy ? "Анализ…" : value ? (score >= 0 ? "+" : "") + (score / 100).toFixed(2) + " за белых" : "Равная позиция"}</span></div>
      <div className="eval-track" role="meter" aria-label="Преимущество белых" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(whiteShare)}><div style={{ width: whiteShare + "%" }} /></div></div>
    <div className="eval-detail">{value && !busy && <div className="move-feedback"><MoveIcon kind={value.kind} /><strong>{value.san} — {labels[value.kind]}</strong><small>Глубина {value.depth} · ход {value.moveNumber}</small></div>}
      {Object.keys(history).length > 0 && <div className="evaluated-moves" aria-label="Оценка ходов">{Object.values(history).sort((a, b) => a.moveNumber - b.moveNumber).map(item => <span key={item.moveNumber} title={labels[item.kind]}><b>{Math.ceil(item.moveNumber / 2)}{item.moveNumber % 2 ? "." : "..."}</b> {item.san} <MoveIcon kind={item.kind} size={19} /></span>)}</div>}</div>
  </div>;
}

