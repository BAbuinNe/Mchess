import { useEffect, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import { engine, type EngineResult } from "./engine";
import MoveIcon from "./MoveIcon";

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
  const loss = expected - actual;
  const uci = move.from + move.to + (move.promotion || "");
  const engineBest = uci === before.move;
  if (expected > 300 && actual < 50 && loss > 250) return "missed-win";
  if (loss >= 300) return "blunder";
  if (loss >= 140) return "mistake";
  if (loss >= 60) return "inaccuracy";
  if (engineBest && before.depth >= 16 && after.depth >= 16 && sacrifice(game, move) && actual >= expected - 20) return "brilliant";
  if (engineBest && expected < -100 && actual > expected + 100) return "great";
  if (engineBest || loss <= 15) return "best";
  if (loss <= 35) return "excellent";
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
      const before = await engine().search(beforeFen, 20, 350);
      const after = await engine().search(afterFen, 20, 350);
      if (currentGeneration !== generation.current) return;
      const result = { score: (move.color === "w" ? -1 : 1) * centipawns(after), kind: classify(before, after, move, new Chess(afterFen)), san: move.san, depth: Math.min(before.depth, after.depth), moveNumber: history.length };
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
