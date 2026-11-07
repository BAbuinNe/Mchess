import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import { engine } from "./engine";
import { classify, labels, type MoveKind } from "./LiveEvaluation";
import { loadOpeningBook } from "./openingBook";
import MoveIcon from "./MoveIcon";

const kinds: MoveKind[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "missed-win", "blunder"];

export default function GameReport({ pgn }: { pgn: string }) {
  const [evaluated, setEvaluated] = useState<Record<number, MoveKind>>({});
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const game = useMemo(() => {
    const chess = new Chess();
    try { if (pgn) chess.loadPgn(pgn); } catch { /* invalid PGN has no report */ }
    return chess;
  }, [pgn]);
  const history = game.history({ verbose: true });
  const selectedPly = selected ?? history.length;
  const replay = new Chess();
  for (const move of history.slice(0, selectedPly)) replay.move(move);
  const counts = Object.values(evaluated).reduce<Partial<Record<MoveKind, number>>>((result, kind) => {
    result[kind] = (result[kind] || 0) + 1;
    return result;
  }, {});

  useEffect(() => {
    let active = true;
    setEvaluated({});
    setProgress(0);
    setError("");
    setSelected(null);
    if (!history.length) return;
    void (async () => {
      const entries = await loadOpeningBook().catch(() => []);
      const walk = new Chess();
      let before = await engine().search(walk.fen(), 20, 300);
      for (let index = 0; index < history.length; index++) {
        if (!active) return;
        const move = walk.move(history[index]);
        const after = await engine().search(walk.fen(), 20, 300);
        if (!active) return;
        const played = history.slice(0, index + 1).map(item => item.san);
        const isBook = entries.some(entry => entry.moves.length >= played.length && played.every((san, ply) => entry.moves[ply] === san));
        const kind = isBook ? "book" : classify(before, after, move, walk);
        setEvaluated(previous => ({ ...previous, [index + 1]: kind }));
        setProgress(index + 1);
        before = after;
      }
    })().catch(() => { if (active) setError("Не удалось завершить анализ партии. Попробуйте открыть отчёт ещё раз."); });
    return () => { active = false; };
  }, [pgn]);

  return <div className="card game-report">
    <h2>Отчёт о партии</h2>
    <p>{error || (progress < history.length ? `Анализ ходов: ${progress} из ${history.length}` : `${history.length} полуходов проанализировано`)}</p>
    <div className="report-counts">{kinds.map(kind => <span key={kind}><MoveIcon kind={kind} /> {labels[kind]}: {counts[kind] || 0}</span>)}</div>
    <ChessBoard fen={replay.fen()} compact lastMove={history[selectedPly - 1] || null} moveBadge={selectedPly && evaluated[selectedPly] ? { square: history[selectedPly - 1].to, kind: evaluated[selectedPly] } : null} />
    <div className="report-moves" aria-label="Ходы партии">{history.map((move, index) => <button key={index} type="button" className={selectedPly === index + 1 ? "selected" : ""} onClick={() => setSelected(index + 1)}>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{move.san} {evaluated[index + 1] && <MoveIcon kind={evaluated[index + 1]} size={19} />}</button>)}</div>
  </div>;
}
