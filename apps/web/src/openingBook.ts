type Opening = { eco: string; name: string; moves: string[] };
let book: Promise<Opening[]> | null = null;

export function loadOpeningBook(): Promise<Opening[]> {
  if (!book) book = fetch("/assets/openings.json").then(response => {
    if (!response.ok) throw new Error("Opening book unavailable");
    return response.json() as Promise<Opening[]>;
  });
  return book;
}

export function identifyOpening(history: string[], entries: Opening[]) {
  const matched = entries.filter(entry => entry.moves.length <= history.length &&
    entry.moves.every((move, index) => move === history[index]));
  const opening = matched.reduce<Opening | null>((best, item) =>
    !best || item.moves.length > best.moves.length ? item : best, null);
  const gambit = matched.filter(item => /gambit/i.test(item.name)).reduce<Opening | null>((best, item) =>
    !best || item.moves.length > best.moves.length ? item : best, null);
  return { opening, gambit };
}
