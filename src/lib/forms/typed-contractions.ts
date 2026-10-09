/**
 * "WOULDNT REHIRE", "SHE DIDNT GIVE NOTICE": CONTRACTIONS TYPED WITHOUT THE
 * APOSTROPHE.
 *
 * The negation readers look for "wouldn't", "didn't", "don't" — and on a phone
 * the apostrophe is the first thing to go. "Wouldnt rehire her" was read as no
 * answer at all, and "she didnt give notice" lost its "not". The apostrophe is
 * put back before anything reads the sentence, for the negative auxiliaries
 * only: each of these spellings is a contraction and nothing else, apart from
 * "wont" and "cant", whose other senses ("as was her wont", trade cant) do not
 * appear in a manager's note about an employee.
 */
const NEGATIVE_AUXILIARY =
  /\b(would|could|should|did|does|do|is|was|were|are|has|have|had|must|need)nt\b/gi;

export function repairContractions(text: string): string {
  return (text ?? "")
    .replace(NEGATIVE_AUXILIARY, (_match, stem: string) => `${stem}n't`)
    .replace(/\bwont\b/gi, (word) => (word[0] === "W" ? "Won't" : "won't"))
    .replace(/\bcant\b/gi, (word) => (word[0] === "C" ? "Can't" : "can't"));
}
