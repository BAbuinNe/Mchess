import { useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "./ChessBoard";

type Exercise = {
  id: string;
  title: string;
  theme: string;
  fen: string;
  from: Square;
  to: Square;
  hint: string;
  explanation: string;
};

const exercises: Exercise[] = [
  {
    id: "mate-one",
    title: "Мат в один ход",
    theme: "Тактика",
    fen: "7k/6pp/4r1Q1/8/3B3K/8/8/8 w - - 0 1",
    from: "g6", to: "g7",
    hint: "Слон на d4 защищает поле g7.",
    explanation: "Ферзь берёт пешку на g7 с матом: королю некуда уйти, а слон защищает ферзя."
  },
  {
    id: "win-queen",
    title: "Выиграйте ферзя",
    theme: "Тактика",
    fen: "6k1/8/5q2/8/4N3/8/8/6K1 w - - 0 1",
    from: "e4", to: "f6",
    hint: "Конь может взять фигуру через занятую линию.",
    explanation: "Конь берёт ферзя на f6 с шахом. Конь перескакивает через другие поля."
  },
  {
    id: "promotion",
    title: "Превратите пешку",
    theme: "Основы",
    fen: "7k/4P2p/8/6K1/8/8/8/8 w - - 0 1",
    from: "e7", to: "e8",
    hint: "Пешке остался один шаг до последней горизонтали.",
    explanation: "Пешка дошла до e8 и стала ферзём. Новый ферзь сразу объявляет шах."
  }
];

const key = "mchess.solvedExercises";
function loadSolved(): string[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as string[]; }
  catch { return []; }
}

export default function Training({ lesson = false }: { lesson?: boolean }) {
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<string[]>(loadSolved);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [completedFen, setCompletedFen] = useState<string | null>(null);
  const item = exercises[index];
  const done = completedFen !== null;

  function select(next: number) {
    setIndex(next);
    setHint(false);
    setFeedback("");
    setCompletedFen(null);
  }

  function attempt(from: Square, to: Square, promotion?: string) {
    if (done) return;
    if (from !== item.from || to !== item.to || (item.id === "promotion" && promotion !== "q")) {
      setFeedback("Ход легален, но задачу не решает. Попробуйте ещё раз.");
      return;
    }
    const chess = new Chess(item.fen);
    chess.move({ from, to, promotion: promotion || "q" });
    setCompletedFen(chess.fen());
    setFeedback(item.explanation);
    if (!solved.includes(item.id)) {
      const next = [...solved, item.id];
      setSolved(next);
      localStorage.setItem(key, JSON.stringify(next));
    }
  }

  return (
    <section className="page training-page">
      <div className="page-heading"><div><span className="eyebrow">{lesson ? "АКАДЕМИЯ" : "ТРЕНИРОВКА"}</span><h1>{lesson ? "Интерактивные уроки" : "Шахматные задачи"}</h1></div></div>
      <div className="training-tabs">{exercises.map((exercise, i) => <button key={exercise.id} className={i === index ? "active" : ""} onClick={() => select(i)}>{solved.includes(exercise.id) ? "✓ " : ""}{exercise.theme}: {i + 1}</button>)}</div>
      <div className="card training-intro"><span className="eyebrow">{item.theme.toUpperCase()} · {index + 1} ИЗ {exercises.length}</span><h2>{item.title}</h2><p>{lesson ? "Изучите позицию и сделайте ход белыми на доске." : "Ход белых. Найдите решение на доске."}</p></div>
      <ChessBoard fen={completedFen ?? item.fen} onMove={attempt} side="w" />
      {feedback && <div className={"training-feedback " + (done ? "success" : "")} role="status">{feedback}</div>}
      {hint && !done && <div className="card"><strong>Подсказка</strong><p>{item.hint}</p></div>}
      <div className="quick-actions"><button onClick={() => setHint(true)} disabled={done}>♧ Подсказка</button><button onClick={() => select((index + 1) % exercises.length)}>{done ? "Следующая задача →" : "Другая задача →"}</button></div>
      <p className="training-progress">Решено: {solved.length} из {exercises.length}. Прогресс сохраняется на устройстве.</p>
    </section>
  );
}
