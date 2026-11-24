import { readLocationMentions } from "@/lib/forms/location-mention";

/**
 * ============================================================================
 * THE CARD'S STORE, STILL IN ITS ACCOUNT (QA's Bubbles live re-run, 22 Nov 2026, A7 follow-up; QA's option 2)
 * ============================================================================
 *
 * "do verbal for team member <P> at empire, sd. …": the card is filed at the store, and "at Empire, SD" leaves the
 * account (`withoutNamedSalon`). The model sometimes rewords the place mid-sentence ("… came into the store at Empire to
 * show the team …"); code strips a place only where its whole phrase ends (#869: "at kearney high" is no store), so
 * that stayed. The store reader does not read "at Empire to show" either, by the same rule.
 *
 * So the phrase comes from the MANAGER's words: the phrase the store reader matched as the card's store there. It counts
 * only when every sentence of the manager's that holds it reads as that store (a manager who also wrote "she was at
 * kearney high" used the phrase another way, and nothing is said). When that phrase is still in the account, it is
 * returned (as the account has it), so propose_form can tell the model and the reply can be handed back once. The
 * store reader decides; never a word list.
 */

const flat = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const holds = (text: string, phrase: string) => ` ${flat(text)} `.includes(` ${phrase} `);

export function storePhraseLeftInAccount(account: string, managerWords: string, storeId: string): string | null {
  const sentences = managerWords.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
  const readAs = sentences.map((sentence) => readLocationMentions(sentence));
  const phrases = new Set(readAs.flatMap((mentions) => mentions.filter((mention) => mention.locationIds.length === 1 && mention.locationIds[0] === storeId && mention.matched).map((mention) => flat(mention.matched!))));
  for (const phrase of phrases) {
    if (!phrase) continue;
    const otherUse = sentences.some((sentence, at) => holds(sentence, phrase) && !readAs[at]!.some((mention) => mention.locationIds.includes(storeId) && flat(mention.matched ?? "") === phrase));
    if (otherUse || !holds(account, phrase)) continue;
    const words = phrase.split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^A-Za-z0-9]+");
    return new RegExp(`\\b${words}\\b`, "i").exec(account)?.[0] ?? phrase;
  }
  return null;
}
