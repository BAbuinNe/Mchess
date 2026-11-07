import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Chess, type Square } from "chess.js";
import MoveIcon from "./MoveIcon";
import type { MoveKind } from "./LiveEvaluation";

type Props = {
  fen: string;
  onMove?: (from: Square, to: Square, promotion?: string) => void;
  side?: "w" | "b" | "both";
  orientation?: "w" | "b";
  lastMove?: { from: Square; to: Square } | null;
  moveBadge?: { square: Square; kind: MoveKind } | null;
  moveBadges?: { square: Square; kind: MoveKind }[];
  hintMove?: { from: Square; to: Square } | null;
  compact?: boolean;
};

const pieceName: Record<string, string> = {
  k: "король", q: "ферзь", r: "ладья", b: "слон", n: "конь", p: "пешка"
};

function pieceUrl(color: string, type: string) {
  return `/assets/pieces/livius/${color}${type}.svg`;
}

export default function ChessBoard({ fen, onMove, side = "both", orientation = "w", lastMove, moveBadge, moveBadges, hintMove, compact = false }: Props) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const pointerStart = useRef<Square | null>(null);
  const suppressClick = useRef(false);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const legal = useMemo(() => selected ? chess.moves({ square: selected, verbose: true }) : [], [chess, selected]);
  const targets = new Set(legal.map(move => move.to));
  const files = orientation === "b" ? "hgfedcba" : "abcdefgh";
  const ranks = orientation === "b" ? "12345678" : "87654321";
  const checkedKing = chess.isCheck()
    ? chess.board().flat().find(piece => piece?.type === "k" && piece.color === chess.turn())?.square
    : null;

  useEffect(() => { setSelected(null); setPendingPromotion(null); }, [fen]);

  function canSelect(square: Square) {
    const piece = chess.get(square);
    return Boolean(onMove && piece && piece.color === chess.turn() && (side === "both" || side === piece.color));
  }

  function playMove(from: Square, to: Square) {
    if (!onMove) return false;
    const moves = chess.moves({ square: from, verbose: true });
    if (!moves.some(move => move.to === to)) return false;
    if (moves.some(move => move.to === to && move.promotion)) {
      setPendingPromotion({ from, to });
    } else {
      onMove(from, to);
      setSelected(null);
    }
    return true;
  }

  function clickSquare(square: Square) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (selected && playMove(selected, square)) return;
    setSelected(canSelect(square) ? square : null);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, square: Square) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStart.current = canSelect(square) ? square : null;
    if (pointerStart.current) setSelected(square);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const from = pointerStart.current;
    pointerStart.current = null;
    if (!from) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-square]");
    const to = target?.dataset.square as Square | undefined;
    if (to && to !== from && playMove(from, to)) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }

  return (
    <div className={"board-frame" + (compact ? " compact" : "")}>
      <div className="board-grid" role="grid" aria-label="Шахматная доска" onPointerUp={endDrag} onPointerCancel={() => { pointerStart.current = null; }}>
        {Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: 8 }, (_, col) => {
            const square = (files[col] + ranks[row]) as Square;
            const piece = chess.get(square);
            const dark = (row + col) % 2 === 1;
            const isTarget = targets.has(square);
            const isLast = lastMove?.from === square || lastMove?.to === square;
            const badge = moveBadges?.find(item => item.square === square) || (moveBadge?.square === square ? moveBadge : null);
            return (
              <button
                className={"square " + (dark ? "dark" : "light") + (isLast ? " last-move" : "") + (selected === square ? " selected" : "") + (isTarget ? " target" : "") + (checkedKing === square ? " in-check" : "") + (hintMove?.from === square || hintMove?.to === square ? " hint-square" : "")}
                key={square}
                data-square={square}
                type="button"
                onPointerDown={event => startDrag(event, square)}
                onClick={() => clickSquare(square)}
                aria-label={square + (piece ? " " + (piece.color === "w" ? "белая" : "чёрная") + " " + pieceName[piece.type] : "")}
              >
                {col === 0 && <span className="rank-label">{ranks[row]}</span>}
                {row === 7 && <span className="file-label">{files[col]}</span>}
                {piece && <img className="piece" src={pieceUrl(piece.color, piece.type)} alt="" draggable={false} />}
                {badge && piece && <span className="board-move-badge" title={badge.kind}><MoveIcon kind={badge.kind} size={26} /></span>}
                {isTarget && <span className={piece ? "capture-ring" : "move-dot"} />}
              </button>
            );
          })
        )}
      </div>
      {pendingPromotion && <div className="promotion-panel" role="dialog" aria-label="Выберите фигуру для превращения"><strong>Превращение пешки</strong><div>{(["q", "r", "b", "n"] as const).map(piece => <button key={piece} onClick={() => { onMove?.(pendingPromotion.from, pendingPromotion.to, piece); setPendingPromotion(null); setSelected(null); }} aria-label={pieceName[piece]}><img src={pieceUrl(chess.turn(), piece)} alt="" /></button>)}</div><button className="cancel-promotion" onClick={() => setPendingPromotion(null)}>Отмена</button></div>}
    </div>
  );
}
