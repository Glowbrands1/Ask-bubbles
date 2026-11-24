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

/**
 * The ways the text can name the person: the full name, and, with a surname of two words or more, the first name with
 * only part of that surname, its words in order (QA's round 3, U35: for "Liesl Moreno Vargas" the card's Observation said
 * "Liesl Vargas received a customer complaint", and that reached the saved Observation). Each is built from the person's
 * own name, longest first; a partial surname is never the person's name, so it gets the short name too.
 */
function nameForms(words: readonly string[]): string[][] {
  const [first, ...surname] = words;
  const partial: string[][] = [];
  for (let mask = 1; mask < (1 << surname.length) - 1 && surname.length <= 4; mask += 1) {
    partial.push([first!, ...surname.filter((_word, at) => (mask >> at) & 1)]);
  }
  return [[...words], ...partial.sort((a, b) => b.length - a.length)];
}

/** The person's name as a pattern (with `partialSurname`, every one of `nameForms`): its words with any spaces between, whole words, any case, a bold mark either side. */
function namePattern(fullName: string, partialSurname = false): RegExp | null {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const forms = (partialSurname ? nameForms(words) : [[...words]]).map((form) => form.map(escape).join(String.raw`\s+`));
  return new RegExp(String.raw`(\*\*)?(?<![\p{L}'’-])(?:${forms.join("|")})(?![\p{L}-])(\*\*)?`, "giu");
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
  const pattern = namePattern(fullName, true);
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
  const pattern = namePattern(fullName, true);
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

/**
 * ============================================================================
 * A CORRECTED NAME REPLACES THE OLD SPELLING EVERYWHERE (QA's live re-test, 21 Nov 2026)
 * ============================================================================
 *
 * The manager typed "<First> <Lastx>", later corrected it to "<First> <Lasty>": the card's name followed the correction,
 * but its account (and the saved Coaching Details) still said "<First> <Lastx>", copied from the first message. Every
 * mention of another spelling of THIS person becomes `fullName` (the short-name pass then shortens it, as for any other
 * mention). Which spellings are this person is the caller's: `spellings` (the card's earlier name, from its record), and
 * `sameByRoster` for any two-word name in the text sharing a word with the person's name, or written as a name (both words
 * capitalized), that the roster reads as this person alone: a close spelling. Text in quotes is left exactly as written; the full name itself is never touched.
 */
export function withCorrectedSpelling(
  text: string,
  fullName: string,
  spellings: readonly string[],
  sameByRoster?: (name: string) => boolean,
): { text: string; replaced: number } {
  const full = fullName.trim().replace(/\s+/g, " ");
  if (!text || full.split(" ").length < 2) return { text, replaced: 0 };
  const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
  const own = new Set(full.toLowerCase().split(" "));
  const found = new Set<string>(spellings.map((spelling) => spelling.trim().replace(/\s+/g, " ")).filter((spelling) => spelling.split(" ").length >= 2 && !same(spelling, full)));
  if (sameByRoster) {
    const tokens = [...text.matchAll(/\p{L}[\p{L}'’-]*/gu)];
    for (let at = 0; at + 1 < tokens.length; at += 1) {
      const first = tokens[at]!;
      const second = tokens[at + 1]!;
      if (!/^\s+$/.test(text.slice(first.index! + first[0].length, second.index!))) continue;
      const pair = `${first[0]} ${second[0].replace(/['’]s$/i, "")}`;
      /*
       * QA's live re-run on production f9461c1 (22 Nov 2026, A1 notes): "My employee <P1> …" then "Her name is <P2>", where
       * <P1> shares no word with <P2> ("Tadea Krohl" for "Thaddea Kroll"), so the saved write-up kept <P1>. A pair written
       * as a name (each word capitalized, as typed) is read by the roster too, even with no word in common; the roster
       * still decides (`sameByRoster`: this person alone, by close spelling).
       */
      const writtenAsName = /^\p{Lu}/u.test(first[0]) && /^\p{Lu}/u.test(second[0]);
      if (same(pair, full) || (!writtenAsName && !pair.toLowerCase().split(" ").some((word) => own.has(word)))) continue;
      if (sameByRoster(pair)) found.add(pair);
    }
  }
  let replaced = 0;
  let out = text;
  for (const spelling of found) {
    const pattern = namePattern(spelling);
    if (!pattern) continue;
    out = outsideQuotes(out, (piece) =>
      piece.replace(pattern, (_whole, open: string | undefined, close: string | undefined) => {
        replaced += 1;
        return `${open ?? ""}${full}${close ?? ""}`;
      }),
    );
  }
  return { text: out, replaced };
}


/**
 * QA's Bubbles live round 3 (22 Nov 2026, A1(b)): whether a two-word name is a close spelling of the form's full name
 * (first name and surname each within a few letters: at most two, and at most a third of the longer word), as the agent
 * loop reads a name correction. Used to re-check the card's earlier spellings before Create's draft replaces them.
 */
export function closeSpellingOfFullName(said: string, full: string): boolean {
  const parts = (name: string) => name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const a = parts(said);
  const b = parts(full);
  if (a.length < 2 || b.length < 2) return false;
  const distance = (x: string, y: string) => {
    const row = Array.from({ length: y.length + 1 }, (_unused, at) => at);
    for (let i = 1; i <= x.length; i += 1) {
      let previous = row[0]!;
      row[0] = i;
      for (let j = 1; j <= y.length; j += 1) {
        const kept = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (x[i - 1] === y[j - 1] ? 0 : 1));
        previous = kept;
      }
    }
    return row[y.length]!;
  };
  const close = (x: string, y: string) => distance(x, y) <= Math.min(2, Math.max(1, Math.floor(Math.max(x.length, y.length) / 3)));
  return close(a[0]!, b[0]!) && close(a.at(-1)!, b.at(-1)!);
}

/**
 * QA's live re-run (23 Nov 2026, U19, on cad9c15): the card was "<preferred> <last>" and the manager's account said
 * "on 11/14 <legal first> worked …": the pronoun pass and the drafter read the legal first name as someone else ("did not
 * clean up after <preferred>", "the account describes another individual's actions"). The card person's OTHER own first
 * names (Woven's legal or preferred first name, the caller's `otherFirsts`, held by nobody else on the staff list), alone
 * or with the surname, are this person: they become `short`. Text in quotes is left as written.
 */
export function withOwnOtherFirstNames(text: string, otherFirsts: readonly string[], lastName: string, short: string): { text: string; replaced: number } {
  const name = short.trim();
  if (!text || !name || otherFirsts.length === 0) return { text, replaced: 0 };
  let replaced = 0;
  const out = outsideQuotes(text, (piece) =>
    otherFirsts.reduce((current, first) => {
      const words = [first, ...lastName.trim().split(/\s+/).filter(Boolean)].map(escape);
      const full = new RegExp(String.raw`(?<![\p{L}'’-])${words.join(String.raw`\s+`)}(?![\p{L}-])`, "giu");
      const alone = new RegExp(String.raw`(?<![\p{L}'’-])${escape(first)}(?![\p{L}-])`, "giu");
      return current.replace(full, () => ((replaced += 1), name)).replace(alone, () => ((replaced += 1), name));
    }, piece),
  );
  return { text: out, replaced };
}
