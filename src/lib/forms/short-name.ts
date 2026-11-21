/**
 * ============================================================================
 * THE CARD'S PERSON BY THE SHORT NAME, NOT THE FULL NAME (port from the sibling app: its QA, 20 Nov 2026, live)
 * ============================================================================
 *
 * "ca for Fenna Prewitt, late 11/18" once got "Observation of Offense: Fenna was late on 11/18" (the model wrote "She", and
 * the pronoun pass put the reply name in), and once "Fenna Prewitt was late on 11/18" with "Here's the Corrective Action
 * Form for **Fenna Prewitt**" (the model wrote the full name, and nothing shortened it). The drafter then saved "Fenna Prewitt
 * was late to work on November 18, 2026." in Observed. Pau's rule is the first name. The short name is decided by code
 * (`replyNameFor`: the first name, or the full name when someone else shares it); these helpers put it in place of the
 * full name the model or the drafter wrote. They read only the given text and the person's own name, never a word list.
 * Text in quotes is left exactly as written.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Text in straight or curly double quotes: someone's own words, never changed. */
const QUOTED = /("[^"\n]*"|“[^”\n]*”)/;

/** The full name as a pattern: its words with any spaces between, whole words, any case, a bold mark either side. */
function namePattern(fullName: string): RegExp | null {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return new RegExp(String.raw`(\*\*)?(?<![\p{L}'’-])${words.map(escape).join(String.raw`\s+`)}(?![\p{L}-])(\*\*)?`, "giu");
}

function usable(fullName: string, short: string): boolean {
  const full = fullName.trim().replace(/\s+/g, " ");
  const name = short.trim();
  return name !== "" && full.split(" ").length > 1 && name.toLowerCase() !== full.toLowerCase();
}

/** Outside quotes, `change` rewrites each piece of text. */
function outsideQuotes(text: string, change: (piece: string) => string): string {
  return text
    .split(QUOTED)
    .map((piece, at) => (at % 2 === 1 ? piece : change(piece)))
    .join("");
}

/**
 * An account (the card's what_happened, a saved write-up field): every mention of `fullName` becomes `short`
 * ("Fenna Prewitt was late" → "Fenna was late"; "Fenna Prewitt's shift" → "Fenna's shift"). Bold marks are kept as they are.
 */
export function withShortName(text: string, fullName: string, short: string): { text: string; replaced: number } {
  const pattern = namePattern(fullName);
  if (!text || !pattern || !usable(fullName, short)) return { text, replaced: 0 };
  let replaced = 0;
  const out = outsideQuotes(text, (piece) =>
    piece.replace(pattern, (_whole, open: string | undefined, close: string | undefined) => {
      replaced += 1;
      return `${open ?? ""}${short.trim()}${close ?? ""}`;
    }),
  );
  return { text: out, replaced };
}

/**
 * The reply: the card's full name becomes `short` where the reply talks about the person, and stays in full on the
 * lines whose job is to confirm which person it is (the rules book's list). Those lines are told apart by their form,
 * not their words: the app writes the person's name there in bold ("Using **Ozren Brack** from your staff list",
 * "**Corwin Ashdale** isn't on the staff list", "Opening **Ozren Brack**'s form"), and a question (which
 * person, did you mean) ends in "?". So:
 *   - a mention not in bold, in a sentence that is not a question, becomes `short`;
 *   - the reply's opener for this card, "the <template name> for **<full name>**", becomes "for **<short>**";
 *   - every other bold mention, and every question, keeps the full name.
 */
export function replyWithShortName(reply: string, fullName: string, short: string, templateName: string | null): { text: string; replaced: number } {
  const pattern = namePattern(fullName);
  if (!reply || !pattern || !usable(fullName, short)) return { text: reply, replaced: 0 };
  const opener = templateName ? new RegExp(String.raw`\b${escape(templateName.trim())}\s+for\s+$`, "i") : null;
  let replaced = 0;
  const sentence = (text: string) => {
    if (/\?\s*$/.test(text)) return text;
    return outsideQuotes(text, (piece) =>
      piece.replace(pattern, (whole: string, open: string | undefined, close: string | undefined, at: number) => {
        const bold = !!open && !!close;
        if (bold && !(opener && opener.test(piece.slice(0, at)))) return whole;
        replaced += 1;
        return `${open ?? ""}${short.trim()}${close ?? ""}`;
      }),
    );
  };
  const text = reply
    .split("\n")
    .map((line) => line.split(/(?<=[.!?])(\s+)/).map((part, at) => (at % 2 === 1 ? part : sentence(part))).join(""))
    .join("\n");
  return { text, replaced };
}
