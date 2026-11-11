import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "./ChessBoard";
import puzzleData from "./puzzles.json";
import curriculum from "./curriculum.json";

type Exercise = { id: string; course: string; title: string; theme: string; rating: number; fen: string; solution: string[]; solutionSan: string[]; opening: string | null; source: string | null };
const starters: Exercise[] = [
  { id: "mate-one", course: "starter", title: "Мат в один ход", theme: "mateIn1", rating: 0, fen: "7k/6pp/4r1Q1/8/3B3K/8/8/8 w - - 0 1", solution: ["g6g7"], solutionSan: ["Qxg7#"], opening: null, source: null },
  { id: "win-queen", course: "starter", title: "Выиграйте ферзя", theme: "hangingPiece", rating: 0, fen: "6k1/8/5q2/8/4N3/8/8/6K1 w - - 0 1", solution: ["e4f6"], solutionSan: ["Nxf6+"], opening: null, source: null },
  { id: "promotion", course: "starter", title: "Превратите пешку", theme: "promotion", rating: 0, fen: "7k/4P2p/8/6K1/8/8/8/8 w - - 0 1", solution: ["e7e8q"], solutionSan: ["e8=Q+"], opening: null, source: null }
];
const exercises: Exercise[] = [...starters, ...puzzleData.puzzles];
const courses = [{ id: "starter", name: "Вводные", tags: [] }, ...puzzleData.courses];
const courseNotes: Record<string, string> = {
  starter: "Три короткие позиции для знакомства с доской и решением.",
  basics: "Проверьте шахи, взятия и угрозы. Перед ходом найдите ответ соперника.",
  calculation: "Просчитайте форсированный вариант до конца, затем сделайте первый ход.",
  openings: "Дебютная тактика: развивайте фигуры с темпом и проверяйте безопасность короля. Название дебюта не означает, что каждый ход в задаче теоретический.",
  endgame: "В окончании активность короля, проходные пешки и точный порядок ходов особенно важны.",
  application: "Сравните несколько кандидатных ходов и найдите защиту или выигрышный план."
};
const solvedKey = "mchess.solvedExercises";
const attemptsKey = "mchess.exerciseAttempts";
const studiedKey = "mchess.studiedLessons";
function readSaved<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

export default function Training({ lesson = false }: { lesson?: boolean }) {
  const [selectedId, setSelectedId] = useState(() => {
    const stored = localStorage.getItem("mchess.trainingId");
    return exercises.some(item => item.id === stored && (!lesson || item.course !== "starter")) ? stored! : exercises[lesson ? 3 : 0].id;
  });
  const [solved, setSolved] = useState<string[]>(() => readSaved(solvedKey, []));
  const [studied, setStudied] = useState<number[]>(() => readSaved(studiedKey, []));
  const [attempts, setAttempts] = useState<Record<string, number>>(() => readSaved(attemptsKey, {}));
  const [hint, setHint] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [position, setPosition] = useState(() => exercises.find(item => item.id === selectedId)!.fen);
  const [step, setStep] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const replyTimer = useRef<number | null>(null);
  const item = exercises.find(exercise => exercise.id === selectedId) ?? exercises[0];
  const course = courses.find(entry => entry.id === item.course)!;
  const visible = exercises.filter(exercise => exercise.course === item.course);
  const completed = step >= item.solution.length;
  const userSide = item.fen.split(" ")[1] as "w" | "b";
  const courseSolved = visible.filter(exercise => solved.includes(exercise.id)).length;
  const courseIndex = visible.findIndex(exercise => exercise.id === item.id);
  const theory = item.course === "starter" ? null : curriculum.find(step => step.course === item.course && step.number % 10 === (courseIndex + 1) % 10);

  useEffect(() => () => { if (replyTimer.current !== null) window.clearTimeout(replyTimer.current); }, []);

  function select(next: Exercise) {
    if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
    replyTimer.current = null;
    setSelectedId(next.id);
    localStorage.setItem("mchess.trainingId", next.id);
    setPosition(next.fen);
    setStep(0);
    setWaiting(false);
    setHint(0);
    setFeedback("");
  }

  function recordAttempt() {
    setAttempts(previous => {
      const next = { ...previous, [item.id]: (previous[item.id] || 0) + 1 };
      localStorage.setItem(attemptsKey, JSON.stringify(next));
      return next;
    });
  }

  function markStudied() {
    if (!theory || studied.includes(theory.number)) return;
    setStudied(previous => {
      const next = [...previous, theory.number];
      localStorage.setItem(studiedKey, JSON.stringify(next));
      return next;
    });
  }

  function finish() {
    const sequence = item.solutionSan.join(" ");
    setFeedback(`Решено. Проверенный вариант: ${sequence}. Посмотрите, какой ответ был вынужденным.`);
    setSolved(previous => {
      if (previous.includes(item.id)) return previous;
      const next = [...previous, item.id];
      localStorage.setItem(solvedKey, JSON.stringify(next));
      return next;
    });
  }

  function attempt(from: Square, to: Square, promotion?: string) {
    if (waiting || completed) return;
    recordAttempt();
    const expected = item.solution[step];
    if (from + to + (promotion || "") !== expected) {
      setFeedback("Ход допустим, но не входит в проверенное решение. Посмотрите на угрозы и попробуйте снова.");
      return;
    }
    const game = new Chess(position);
    game.move({ from, to, promotion: promotion || "q" });
    setPosition(game.fen());
    setHint(0);
    if (step + 1 >= item.solution.length) { setStep(item.solution.length); finish(); return; }
    setWaiting(true);
    setFeedback("Верно. Соперник отвечает…");
    replyTimer.current = window.setTimeout(() => {
      const reply = item.solution[step + 1];
      game.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || "q" });
      setPosition(game.fen());
      setStep(step + 2);
      setWaiting(false);
      setFeedback("Теперь найдите следующий ход в варианте.");
      replyTimer.current = null;
    }, 420);
  }

  return <section className="page training-page">
    <div className="page-heading"><div><span className="eyebrow">{lesson ? "АКАДЕМИЯ" : "ТРЕНИРОВКА"}</span><h1>{lesson ? "Пять разделов обучения" : "Шахматные задачи"}</h1></div></div>
    <div className="course-tabs" aria-label="Разделы обучения">{courses.filter(entry => !lesson || entry.id !== "starter").map(entry => {
      const list = exercises.filter(exercise => exercise.course === entry.id);
      const count = lesson ? curriculum.filter(step => step.course === entry.id && studied.includes(step.number)).length : list.filter(exercise => solved.includes(exercise.id)).length;
      return <button key={entry.id} className={entry.id === item.course ? "active" : ""} onClick={() => select(list[0])}><strong>{entry.name}</strong><small>{count}/{list.length}</small></button>;
    })}</div>
    <div className="card training-intro"><span className="eyebrow">{course.name.toUpperCase()} · {visible.findIndex(exercise => exercise.id === item.id) + 1} ИЗ {visible.length}</span><h2>{item.title}</h2><p>{courseNotes[item.course]}</p><p>Ход {userSide === "w" ? "белых" : "чёрных"}{item.rating ? ` · сложность ${item.rating}` : ""}{item.opening ? ` · ${item.opening}` : ""}. Найдите продолжение на доске.</p></div>
    {lesson && theory && <div className="card theory-step"><span className="eyebrow">ТЕОРЕТИЧЕСКИЙ ШАГ {theory.number} ИЗ 50</span><h2>{theory.title}</h2><p>{theory.task}</p><p><strong>Проверьте себя:</strong> {theory.criterion}</p><button onClick={markStudied} disabled={studied.includes(theory.number)}>{studied.includes(theory.number) ? "✓ Изучено" : "Отметить изученным"}</button><small>Ниже — самостоятельная практика из того же раздела; позиция может иллюстрировать другой мотив.</small></div>}
    <div className="puzzle-picker" aria-label="Выбор задачи">{visible.map((exercise, index) => <button key={exercise.id} className={(exercise.id === item.id ? "active " : "") + (solved.includes(exercise.id) ? "solved" : "")} onClick={() => select(exercise)} title={exercise.title}>{solved.includes(exercise.id) ? "✓" : index + 1}</button>)}</div>
    <ChessBoard fen={position} onMove={waiting || completed ? undefined : attempt} side={userSide} orientation={userSide} />
    {feedback && <div className={"training-feedback " + (completed ? "success" : "")} role="status">{feedback}</div>}
    {hint > 0 && !completed && <div className="card"><strong>Подсказка {hint} из 3</strong><p>{hint === 1 ? `Тема: ${item.title}. Проверьте шахи, взятия и угрозы.` : hint === 2 ? `Начальная клетка: ${item.solution[step].slice(0, 2)}.` : `Ищите ход ${item.solutionSan[step]}.`}</p></div>}
    <div className="quick-actions"><button onClick={() => setHint(value => Math.min(3, value + 1))} disabled={completed || waiting || hint === 3}>♧ Подсказка</button><button onClick={() => select(visible[(visible.findIndex(exercise => exercise.id === item.id) + 1) % visible.length])}>Следующая задача →</button></div>
    <p className="training-progress">В этом разделе решено {courseSolved} из {visible.length}; всего {solved.filter(id => exercises.some(exercise => exercise.id === id)).length} из {exercises.length}. {lesson ? `Теории изучено: ${studied.length} из 50. ` : ""}Попыток: {attempts[item.id] || 0}. Прогресс хранится на устройстве.</p>
    {item.source && <p className="training-source">Задача из <a href={item.source} target="_blank" rel="noopener noreferrer">открытой базы Lichess</a> (CC0). Позиция и вариант проверены правилами chess.js.</p>}
  </section>;
}

