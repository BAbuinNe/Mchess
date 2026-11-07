export const REACTION_IDS = [
  "reaction_00", "reaction_02", "reaction_03", "reaction_04", "reaction_05", "reaction_06",
  "reaction_07", "reaction_08", "reaction_09", "reaction_10", "reaction_11", "reaction_12",
  "reaction_13", "reaction_14", "reaction_15", "reaction_16", "reaction_17", "reaction_18",
  "reaction_19", "reaction_20", "reaction_21", "reaction_22", "reaction_23", "reaction_24",
  "reaction_25", "reaction_26", "reaction_27", "reaction_28", "reaction_29", "reaction_30",
  "reaction_31", "reaction_32", "reaction_33", "reaction_34", "reaction_35", "reaction_36",
  "reaction_37", "reaction_38", "reaction_39", "reaction_40", "reaction_41", "reaction_42",
  "reaction_43", "reaction_44", "reaction_45", "reaction_46"
] as const;

export type ReactionId = (typeof REACTION_IDS)[number];

let deck: ReactionId[] = [];

// Cycle through a shuffled deck so every supplied clip gets a turn before any repeats.
export function nextReaction(): ReactionId {
  if (deck.length === 0) {
    deck = [...REACTION_IDS];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop()!;
}
