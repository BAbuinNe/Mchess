import type { MoveKind } from "./LiveEvaluation";

const colors: Record<MoveKind, string> = {
  brilliant: "#20b8ad", great: "#69a9d0", best: "#94b751", excellent: "#91b94e", good: "#91ac87",
  book: "#b68b67", inaccuracy: "#ebbb43", mistake: "#ec9753", "missed-win": "#e77565", blunder: "#df4c42"
};

export default function MoveIcon({ kind, size = 24 }: { kind: MoveKind; size?: number }) {
  const glyph = kind === "brilliant" ? "!!" : kind === "great" ? "!" : kind === "inaccuracy" ? "?!" : kind === "mistake" ? "?" : kind === "blunder" ? "??" : null;
  return <svg className="move-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="16" cy="16" r="15" fill={colors[kind]} />
    {glyph && <text x="16" y="22" fill="white" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize={glyph.length > 1 ? 16 : 21}>{glyph}</text>}
    {kind === "best" && <path fill="white" d="m16 5 3.2 6.5 7.2 1-5.2 5.1 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1z" />}
    {kind === "excellent" && <path fill="white" d="M8 15h4l3.5-7c.7-1.4 2.8-.8 2.6.8l-.5 5.2h6c1.9 0 2.8 1.2 2.4 2.9l-1.7 7c-.3 1.4-1.5 2.1-3 2.1H13l-2-1.5H8z" />}
    {kind === "good" && <path fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="m7 16 6 6 12-12" />}
    {kind === "book" && <path fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M16 10c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V9c-4-1-7-1-10 1zm0 0v14" />}
    {kind === "missed-win" && <path fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" d="m10 10 12 12m0-12L10 22" />}
  </svg>;
}
