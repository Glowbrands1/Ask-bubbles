import { payrollAmountSameMessageEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * ONE MESSAGE, SEVERAL REQUESTS
 * ============================================================================
 *
 * Managers put more than one thing in a message: a correction and a
 * question, two forms, a change and a rewrite. Every reader in the forms path
 * answers ONE thing per turn, so whatever else the message asked used to be
 * dropped without a word. These helpers take a message apart so the caller can
 * do the part it understands and NAME the rest back, word for word.
 *
 * Pure and browser-safe: no identity, no database.
 */

/** Words that open a clause without being part of what it says. */
export const LEAD_IN = /^(?:and|also|plus|oh|ok|okay|btw|then|so)\b[,\s]*/i;

const CLAUSE_SPLIT = /\s*(?:[.;!?]+\s+|,\s*|\s+(?:and|also|then|plus)\s+)/i;

/** The clauses of `text`: cut at sentence ends, commas and joining words. */
export function clausesOf(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT)
    .map((clause) => clause.replace(/[.!]+$/, "").trim())
    .filter(Boolean);
}

/**
 * Each sentence of `text`, as typed. A point inside an amount ("$3.25") does
 * not end one, so "payroll deduct to yes, $3.25 will be deducted" keeps its
 * amount whole for the Action Plan (`ca-action-plan.ts`).
 */
export function sentencesOf(text: string): string[] {
  return [...text.matchAll(/(?:[^.!?\n]|\.(?=\d))+[.!?]*/g)].map((match) => match[0].trim()).filter(Boolean);
}

/*
 * A QUESTION IS ONE THAT ENDS IN "?" OR OPENS WITH A WH-WORD. The broader
 * `isQuestion` also counts an opening auxiliary ("will", "is", "does"), which
 * is right for one sentence on its own but wrong here: "will be dropped to
 * min wage" in a list of exit facts is a statement, and setting it aside would
 * leave it unread.
 */
const WH_OPENER = /^(?:what|what's|whats|how|how's|when|where|why|who|which)\b/i;

/*
 * "WHICH WILL BE PAYROLL DEDUCTED" IS NOT A QUESTION (PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED; live chat, 5 Nov 2026).
 * "…the register was off $20. which will be payroll deducted from <name>'s check." got "You also asked
 * \"which will be payroll deducted…\"": a stray full stop cut a relative clause off its sentence. "Which" straight
 * before a helping verb, with no "?", goes on describing what came before; "which store is she at" still asks.
 */
const RELATIVE_CLAUSE = /^which\s+(?:will|would|is|was|are|were|has|had|have|should|must|can|could|may|might)\b/i;

/** The message's questions, and the statements left once they are taken out. */
export function separateQuestions(text: string): { statements: string; questions: string[] } {
  const questions: string[] = [];
  const statements: string[] = [];
  const relativeNotQuestion = payrollAmountSameMessageEnabled();
  for (const sentence of sentencesOf(text)) {
    const opened = sentence.replace(LEAD_IN, "");
    const relative = relativeNotQuestion && !/\?\s*$/.test(sentence) && RELATIVE_CLAUSE.test(opened);
    if (/\?\s*$/.test(sentence) || (WH_OPENER.test(opened) && !relative)) questions.push(sentence);
    else statements.push(sentence);
  }
  return { statements: statements.join(" "), questions };
}
