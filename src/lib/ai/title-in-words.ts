/**
 * Whether a directory title is in the manager's words.
 *
 * Ported from the sibling app (QA round 10): its directory carries a
 * two-letter title, and "she signed one box with a arrown throught the rest"
 * contains those letters, so a Coaching Form printed it as the job title. A
 * title is found only as a whole word. A short all-capitals title is an
 * initialism and is found only as typed: "1 hr late" is an hour.
 */

const INITIALISM = /^[A-Z&]{1,4}$/;

function escaped(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function titleInWords(title: string, text: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const pattern = `(?<![A-Za-z0-9'’])${words.map(escaped).join("\\s+")}(?![A-Za-z0-9'’])`;
  return new RegExp(pattern, INITIALISM.test(title.trim()) ? "" : "i").test(text);
}
