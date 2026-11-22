import { readSalonMentions, rosterSalonName } from "./places";

/**
 * ============================================================================
 * A REPLY NEVER NAMES A STORE NOBODY NAMED (QA's Bubbles re-run, 22 Nov 2026, A8)
 * ============================================================================
 *
 * "coaching is on sfs operations for clean organization and flow. BCS has flagged our SFS …" (SFS: ship from store) got
 * "which Sioux Falls location is this for, W 41st St or E 18th St?" The app's store reader reads no store in those
 * turns; the model guessed one. Stores are read with the app's own reader (`readSalonMentions`), so no word list: a
 * store the reply names that no manager turn names and the card does not hold is a guess.
 */

/** The display names of the stores the reply names that no manager turn names and the card does not hold. */
export function storesNamedNotSaid(reply: string, managerTurns: readonly string[], cardStoreId: string | null): string[] {
  const said = new Set(managerTurns.flatMap((turn) => readSalonMentions(turn).flatMap((mention) => [...mention.salonIds])));
  if (cardStoreId) said.add(cardStoreId);
  const named = readSalonMentions(reply).flatMap((mention) => [...mention.salonIds]);
  const guessed = [...new Set(named.filter((id) => !said.has(id)))];
  return guessed.map((id) => rosterSalonName(id) ?? id);
}

/**
 * The reply without its sentences that name a guessed store (the store question is asked after it). A question right
 * after a dropped sentence, in the same paragraph, asks about the stores that sentence named ("You have two Sioux Falls
 * stores — A and B. Which one is this coaching for?", QA's live re-run 2, A8), so it goes with it.
 */
export function withoutStoreGuess(reply: string, guessed: readonly string[]): string {
  const named = (sentence: string) => readSalonMentions(sentence).length > 0 && storesNamedNotSaid(sentence, [], null).some((name) => guessed.includes(name));
  return reply
    .split(/\n+/)
    .map((paragraph) => {
      let dropped = false;
      return paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => {
          const drop = named(sentence) || (dropped && /\?\s*$/.test(sentence));
          dropped = drop;
          return !drop;
        })
        .join(" ")
        .trim();
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}
