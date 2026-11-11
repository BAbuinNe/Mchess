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
const recentKey = "mchess.mellstroyRecentClips";

function recentClips(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(recentKey) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(-8) : [];
  } catch { return []; }
}

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
  // The brilliant and positive pools overlap. Avoid showing the same clip
  // again just because the next move belongs to another group.
  const recent = recentClips();
  let unseenIndex = -1;
  for (let index = decks[group]!.length - 1; index >= 0; index--) {
    if (!recent.includes(decks[group]![index])) { unseenIndex = index; break; }
  }
  if (unseenIndex >= 0 && unseenIndex !== decks[group]!.length - 1) {
    const [unseen] = decks[group]!.splice(unseenIndex, 1);
    decks[group]!.push(unseen);
  }
  const clip = decks[group]!.pop()!;
  try {
    localStorage.setItem(`mchess.mellstroyDeck.${group}`, JSON.stringify(decks[group]));
    localStorage.setItem(recentKey, JSON.stringify([...recent, clip].slice(-8)));
  } catch { /* local storage may be unavailable */ }
  return clip;
}

export function nextMellstroyClip(kind: MoveKind): string {
  const group: Group = kind === "brilliant" ? "brilliant" :
    ["inaccuracy", "mistake", "blunder", "missed-win"].includes(kind) ? "negative" :
      ["good", "excellent", "best", "great"].includes(kind) ? "positive" : "general";
  const selected = draw(group);
  return selected.startsWith("legacy:") ? `/assets/reactions/${selected.slice(7)}.webm` : `/assets/reactions/mellstroy/${selected}.webm`;
}

