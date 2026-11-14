/**
 * A place in the store where someone works ("front desk", "the register", "back room"): a place phrase the card's
 * Issue keeps (ISSUE_KEEPS_WORK_AREA, `forms/incident-issue.ts`), never a store. QA, 13 Nov 2026. The sibling app has
 * its own list for its own floor plan.
 */
export const WORK_AREA =
  /^(?:the\s+)?(?:front\s+desk|desk|front\s+counter|counter|(?:cash\s+)?register|checkout|back\s+room|break\s*room|stock\s*room|storage\s+room|lobby|front|floor|sales\s+floor|restroom|bathroom)$/i;

/** "at the front desk" in `text`, as said, when what follows "at" is a work area; null otherwise. */
export function workAreaPhrase(text: string): string | null {
  // The words are read in a lookahead, so "at" right after another "at" is still read (Gate-Bubbles, #880 p31–p33).
  for (const match of text.matchAll(/\bat(?=\s+((?:the\s+)?[a-z#0-9]+(?:\s+[a-z#0-9]+){0,2})\b)/gi)) {
    const words = match[1]!.split(/\s+/);
    // The longest work area from the start of the phrase: "at the front desk today" reads "the front desk".
    for (let length = words.length; length >= 1; length -= 1) {
      const area = words.slice(0, length).join(" ");
      if (WORK_AREA.test(area)) return `at ${area}`;
    }
  }
  return null;
}

/**
 * Whether `text` names a work area after any place word ("in the back room", "near the register", "behind the counter",
 * "by the front desk", "on the sales floor", "at the register"): the account already says where (Gate-Bubbles, #880
 * p19/p24).
 */
export function namesWorkArea(text: string): boolean {
  // The words after each place word are read in a lookahead, so one place word's words never swallow the next place word
  // ("at a guest in the back room" still reads "in the back room"; Gate-Bubbles, #880 p31–p33).
  for (const match of text.matchAll(/\b(?:at|in|inside|near|by|behind|beside|next\s+to|on|around|outside)(?=\s+((?:the\s+)?[a-z#0-9]+(?:\s+[a-z#0-9]+){0,2})\b)/gi)) {
    // "in front of everyone" is not the front: the idiom names no work area.
    if (/^front\s+of\b/i.test(match[1]!)) continue;
    const words = match[1]!.split(/\s+/);
    for (let length = words.length; length >= 1; length -= 1) {
      if (WORK_AREA.test(words.slice(0, length).join(" "))) return true;
    }
  }
  return false;
}
