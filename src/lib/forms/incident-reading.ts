/**
 * ============================================================================
 * HAS THE MANAGER ALREADY SAID WHAT HAPPENED?
 * ============================================================================
 *
 * Ported from the reference platform's `describesIncident`, where it lived in
 * one form's intake module and was reused by every chat form so none of them
 * asked for an account the manager had already given. The reading names no
 * form, so here it is its own module.
 *
 * TWO WAYS IN, either sufficient: a topic a manager documents, or an
 * observational clause ("she was …", "didn't …", "I noticed …"). Neither is a
 * claim that the account is GOOD ENOUGH to draft from — the drafting route
 * enforces its own minimum and its own guards. It is only the difference
 * between a manager who has described something and one who has typed nothing
 * but the form's name.
 *
 * The topic list is ordinary workplace vocabulary — attendance, appearance,
 * conduct, cash handling, safety — with the reference company's trade words
 * removed. It decides only whether to ASK; it never decides what a form says.
 */

const INCIDENT_TOPIC: readonly RegExp[] = [
  /\b(?:late|lateness|tardy|tardiness|overslept)\b/,
  /\b(?:left early|leaving early|clocked out early)\b/,
  /\b(?:absent|absence|absenteeism|no[- ]call|no[- ]show|called out|call[- ]?off|missed (?:her|his|their|the) shift)\b/,
  /\b(?:dress code|uniform|attire|apron|name tag|nametag|hoodie)\b/,
  /\b(?:phone|cell phone|on her phone|on his phone|social media)\b/,
  /\b(?:rude|unprofessional|argued|arguing|shouted|yelled|swore|swearing|disrespect\w*)\b/,
  /\b(?:refus\w+|insubordinat\w+|would not follow|didn't follow|did not follow|ignored (?:my|the) (?:direction|instruction))\b/,
  /\b(?:cash|drawer|register|till|deposit|void|refund|discount)\b/,
  /\b(?:safety|injur\w+|hazard|spill|chemical|cleaning|closing duties|opening duties|checklist)\b/,
  /\b(?:harass\w+|theft|stole|stealing|dishonest\w*|falsif\w+)\b/,
  /\b(?:standards of conduct|policy violation|violated (?:the|our) polic)\b/,
];

const OBSERVATIONAL_CLAUSE: readonly RegExp[] = [
  /\b(?:she|he|they|the employee|[a-z]+)\s+(?:was|were|has been|have been|had been)\s+\w+/,
  /\b(?:she|he|they)\s+(?:arrived|showed up|came in|left|wore|refused|failed|forgot|ignored|walked out|clocked|missed|skipped)\b/,
  /\b(?:didn't|did not|hasn't|has not|wouldn't|would not)\s+\w+/,
  /\bi (?:saw|observed|watched|found|noticed|had to)\b/,
  /^(?:missed|skipped|forgot|ignored|refused|left)\b/,
];

function normalize(text: string): string {
  return (text ?? "").toLowerCase().replace(/[^\S\n]+/g, " ").trim();
}

const any = (text: string, patterns: readonly RegExp[]) => patterns.some((pattern) => pattern.test(text));

/** Whether the manager has already described what happened. */
export function describesIncident(text: string): boolean {
  const normalized = normalize(text);
  return any(normalized, INCIDENT_TOPIC) || any(normalized, OBSERVATIONAL_CLAUSE);
}
