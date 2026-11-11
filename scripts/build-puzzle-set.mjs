import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const input = JSON.parse(readFileSync("media-review/lichess-puzzle-sample.json", "utf8"));
const courses = [
  { id: "basics", name: "Основы и тактика", tags: ["mateIn1", "hangingPiece", "fork", "pin", "backRankMate", "promotion", "oneMove"] },
  { id: "calculation", name: "Тактика и расчёт", tags: ["mateIn2", "discoveredAttack", "deflection", "attraction", "skewer", "sacrifice", "clearance"] },
  { id: "openings", name: "Дебюты и гамбиты", tags: ["opening"] },
  { id: "endgame", name: "Стратегия и эндшпиль", tags: ["rookEndgame", "pawnEndgame", "queenEndgame", "zugzwang", "advancedPawn", "endgame"] },
  { id: "application", name: "Анализ и применение", tags: ["defensiveMove", "quietMove", "equality", "advantage", "long"] },
];
const titles = {
  mateIn1: "Мат в один ход", hangingPiece: "Незащищённая фигура", fork: "Вилка", pin: "Связка", backRankMate: "Мат по последней горизонтали", promotion: "Превращение пешки", oneMove: "Точный ход",
  mateIn2: "Мат в два хода", discoveredAttack: "Открытое нападение", deflection: "Отвлечение", attraction: "Заманивание", skewer: "Рентген", sacrifice: "Жертва", clearance: "Освобождение линии",
  opening: "Дебютная тактика", rookEndgame: "Ладейное окончание", pawnEndgame: "Пешечное окончание", queenEndgame: "Ферзевое окончание", zugzwang: "Цугцванг", advancedPawn: "Проходная пешка", endgame: "Эндшпиль",
  defensiveMove: "Защита позиции", quietMove: "Тихий ход", equality: "Сохраните равенство", advantage: "Увеличьте преимущество", long: "Рассчитайте вариант"
};
const used = new Set();
function convert(row, course, tag) {
  const line = row.Moves.split(" ");
  if (line.length < 2 || line.length > 7) return null;
  const game = new Chess(row.FEN);
  try {
    const san = [];
    for (const uci of line) san.push(game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" }).san);
    const initial = new Chess(row.FEN);
    initial.move({ from: line[0].slice(0, 2), to: line[0].slice(2, 4), promotion: line[0][4] || "q" });
    const puzzle = new Chess(initial.fen());
    for (const uci of line.slice(1)) puzzle.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    return { id: row.PuzzleId, course: course.id, title: titles[tag], theme: tag, rating: Number(row.Rating), fen: initial.fen(), solution: line.slice(1), solutionSan: san.slice(1), opening: row.OpeningTags.split(" ")[0]?.replaceAll("_", " ") || null, source: `https://lichess.org/training/${row.PuzzleId}` };
  } catch { return null; }
}
const result = [];
for (const course of courses) {
  const picked = [];
  let round = 0;
  while (picked.length < 10 && round < 40) {
    const tag = course.tags[round % course.tags.length];
    const candidates = input.filter(row => !used.has(row.PuzzleId) && row.Themes.split(" ").includes(tag) && Number(row.Popularity) >= 90 && Number(row.NbPlays) >= 80 && Number(row.Rating) >= 600 && Number(row.Rating) <= 2200 && (course.id !== "openings" || row.OpeningTags));
    const row = candidates[Math.floor(round / course.tags.length) * 17 % (candidates.length || 1)];
    if (row) {
      const puzzle = convert(row, course, tag);
      if (puzzle) { picked.push(puzzle); used.add(row.PuzzleId); }
    }
    round++;
  }
  if (picked.length !== 10) throw new Error(`Only ${picked.length} puzzles for ${course.id}`);
  result.push(...picked);
}
if (result.length !== 50) throw new Error("Expected 50 puzzles");
writeFileSync("apps/web/src/puzzles.json", JSON.stringify({ source: "Lichess puzzle database, CC0, sample 2026-11-09", courses, puzzles: result }, null, 2) + "\n");
console.log(`Validated ${result.length} legal puzzle lines from ${new Set(result.map(item => item.id)).size} Lichess IDs`);

