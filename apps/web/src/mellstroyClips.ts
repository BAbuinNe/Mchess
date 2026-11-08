import type { MoveKind } from "./LiveEvaluation";

const all = Array.from({ length: 56 }, (_, index) => `meme-${String(index + 1).padStart(2, "0")}`);
// Groups follow the transcript and visual review catalogue; clips without a
// reliable polarity are used for the trainer's own moves, never as move grades.
const positive = ["08", "13", "14", "16", "18", "20", "21", "23", "33"].map(id => `meme-${id}`);
const negative = ["03", "04", "17", "31", "38", "39", "41", "44", "52"].map(id => `meme-${id}`);
const general = all.filter(id => !positive.includes(id) && !negative.includes(id));
const brilliant = ["meme-20", "meme-21", "meme-23", "meme-33"];
const pools = { positive, negative, general, brilliant };
type Group = keyof typeof pools;
const decks: Partial<Record<Group, string[]>> = {};

function draw(group: Group) {
  if (!decks[group]) {
    try {
      const saved = JSON.parse(localStorage.getItem(`mchess.mellstroyDeck.${group}`) || "[]") as string[];
      decks[group] = saved.filter(id => pools[group].includes(id));
    } catch { decks[group] = []; }
  }
  if (!decks[group]?.length) {
    const shuffled = [...pools[group]];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    decks[group] = shuffled;
  }
  const clip = decks[group]!.pop()!;
  try { localStorage.setItem(`mchess.mellstroyDeck.${group}`, JSON.stringify(decks[group])); } catch { /* local storage may be unavailable */ }
  return clip;
}

export function nextMellstroyClip(kind: MoveKind, playerMoved: boolean): string {
  const group: Group = !playerMoved ? "general" : kind === "brilliant" ? "brilliant" :
    ["inaccuracy", "mistake", "blunder", "missed-win"].includes(kind) ? "negative" : "positive";
  return `/assets/reactions/mellstroy/${draw(group)}.webm`;
}