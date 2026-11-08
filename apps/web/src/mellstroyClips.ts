import type { MoveKind } from "./LiveEvaluation";
import { REACTION_IDS } from "./reactionCatalog";

const all = Array.from({ length: 56 }, (_, index) => `meme-${String(index + 1).padStart(2, "0")}`);
// Groups follow the transcript and visual review catalogue; clips without a
// reliable polarity are general reactions and never presented as move grades.
const positive = ["08", "13", "14", "16", "18", "20", "21", "23", "33"].map(id => `meme-${id}`);
const negative = ["03", "04", "17", "31", "38", "39", "41", "44", "52"].map(id => `meme-${id}`);
const general = [...all.filter(id => !positive.includes(id) && !negative.includes(id)), ...REACTION_IDS.map(id => `legacy:${id}`)];
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

export function nextMellstroyClip(kind: MoveKind): string {
  const previous = Number(localStorage.getItem("mchess.mellstroyReactionCount") || 0);
  const count = Number.isFinite(previous) ? previous + 1 : 1;
  localStorage.setItem("mchess.mellstroyReactionCount", String(count));
  const group: Group = kind === "brilliant" ? "brilliant" : count % 2 === 0 ? "general" :
    ["inaccuracy", "mistake", "blunder", "missed-win"].includes(kind) ? "negative" : "positive";
  const selected = draw(group);
  return selected.startsWith("legacy:") ? `/assets/reactions/${selected.slice(7)}.webm` : `/assets/reactions/mellstroy/${selected}.webm`;
}