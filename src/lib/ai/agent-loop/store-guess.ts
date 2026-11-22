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

/** The reply without its sentences that name a guessed store (the store question is asked after it). */
export function withoutStoreGuess(reply: string, guessed: readonly string[]): string {
  const sentences = reply.split(/(?<=[.!?])\s+|\n+/);
  const named = (sentence: string) => readSalonMentions(sentence).length > 0 && storesNamedNotSaid(sentence, [], null).some((name) => guessed.includes(name));
  return sentences.filter((sentence) => !named(sentence)).join(" ").trim();
}
