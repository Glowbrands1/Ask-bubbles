/**
 * ============================================================================
 * THE PERFORMANCE MANAGEMENT FRAMEWORK, PREPARED FOR ASK BUBBLES
 * ============================================================================
 *
 * The owner approved using the reference platform's current Performance
 * Management Framework for Ask Bubbles (8 Oct 2026): its policy wording,
 * structure, headings and drafting rules unchanged, with the SOURCE APP'S
 * NAME removed. This module is that transformation, and nothing else:
 *
 *   "ASK SUNNY" → "ASK BUBBLES", "Ask Sunny" → "Ask Bubbles", and a bare
 *   "Sunny" (the app, named on its own) → "Bubbles", possessives included
 *   with the source's own apostrophe ("Sunny's" → "Bubbles'").
 *
 * NOTHING ELSE IS REWRITTEN — not a word, and not a byte: line endings, a
 * byte-order mark and the apostrophe style are the source's. The source
 * company's name, its operational terms, its role titles and every rule stay
 * verbatim; the report lists them so a person can decide on each (`flags`).
 * `restoreAppName` undoes the changes, and the original must come back exactly
 * — that round trip is how "nothing else" is checked rather than assumed.
 * Pure: text in, text and report out.
 */

/** The app-name rules, applied in this order. */
export const APP_NAME_RULES = [
  { id: "ask_sunny_upper", pattern: /ASK SUNNY/g, replacement: "ASK BUBBLES" },
  { id: "ask_sunny_filename", pattern: /ASK_SUNNY/g, replacement: "ASK_BUBBLES" },
  { id: "ask_sunny", pattern: /Ask Sunny/g, replacement: "Ask Bubbles" },
  { id: "sunny_possessive", pattern: /\bSunny(['’])s\b/g, replacement: "Bubbles$1" },
  { id: "sunny_bare", pattern: /\bSunny\b/g, replacement: "Bubbles" },
];

/** The inverse of `APP_NAME_RULES`, for the round-trip check. Reverse order. */
const RESTORE_RULES = [
  { pattern: /\bBubbles(['’])(?!\w)/g, replacement: "Sunny$1s" },
  { pattern: /\bBubbles\b/g, replacement: "Sunny" },
  { pattern: /Ask Bubbles/g, replacement: "Ask Sunny" },
  { pattern: /ASK_BUBBLES/g, replacement: "ASK_SUNNY" },
  { pattern: /ASK BUBBLES/g, replacement: "ASK SUNNY" },
];

/**
 * Undoes the app-name changes. Meaningful only for text that did not already
 * say "Bubbles" — `prepareFramework` reports that (`targetNameInSource`).
 */
export function restoreAppName(text) {
  let out = text;
  for (const rule of RESTORE_RULES) out = out.replace(rule.pattern, rule.replacement);
  return out;
}

/** Wording kept verbatim and reported for a decision: the source company and its operations. */
export const FLAGGED_TERMS = [
  { id: "source_company", label: "Sun Tan City (company name)", pattern: /Sun Tan City/g },
  { id: "salon", label: "salon(s)", pattern: /\bsalons?\b/gi },
  { id: "tanning", label: "tanning", pattern: /\btann\w*/gi },
  { id: "spa", label: "Spa / Spa Wellness / Spa %", pattern: /\bSpa\b/g },
  { id: "sunless_uv", label: "sunless / UV", pattern: /\b(?:sunless|UV)\b/gi },
  { id: "lotion", label: "lotion(s)", pattern: /\blotions?\b/gi },
  { id: "sales_metrics", label: "PPTA / LPSVA / UPTA / Club Close", pattern: /\b(?:PPTA|LPSVA|UPTA|Club Close)\b/g },
  { id: "service_terms", label: "ASTC / BHOW / Routine Mat / MSB / CES / tours", pattern: /\b(?:ASTC|BHOW|Routine Mat|MSB|CES|re-?tours?|tours?)\b/g },
  { id: "role_titles", label: "SDIT / TSD / DMIT / FTTC / ASD", pattern: /\b(?:SDIT|TSD|DMIT|FTTC|ASD)\b/g },
];

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * The prepared text and a report of every change and every flag, with the
 * line it is on. `text` is the whole original file.
 */
export function prepareFramework(text) {
  const changes = [];
  let out = text;
  for (const rule of APP_NAME_RULES) {
    out = out.replace(rule.pattern, (match, ...rest) => {
      const offset = rest.at(-2);
      const whole = rest.at(-1);
      const to = match.replace(new RegExp(rule.pattern.source), rule.replacement);
      changes.push({ rule: rule.id, line: lineOf(whole, offset), from: match, to });
      return to;
    });
  }
  const flags = FLAGGED_TERMS.map((term) => {
    const lines = [];
    for (const match of out.matchAll(term.pattern)) lines.push(lineOf(out, match.index));
    return { id: term.id, label: term.label, count: lines.length, lines: [...new Set(lines)] };
  });
  const companyContexts = [...out.matchAll(/Sun Tan City/g)].map((match) => ({
    line: lineOf(out, match.index),
    context: out.slice(Math.max(0, match.index - 60), match.index + 70).replace(/\s+/g, " ").trim(),
  }));
  return {
    text: out,
    report: {
      appNameChanges: changes.length,
      byRule: Object.fromEntries(APP_NAME_RULES.map((rule) => [rule.id, changes.filter((change) => change.rule === rule.id).length])),
      appNameLeft: (out.match(/Sunny/g) ?? []).length,
      targetNameInSource: (text.match(/Bubbles/g) ?? []).length,
      restoresExactly: restoreAppName(out) === text,
      linesBefore: text.split("\n").length,
      linesAfter: out.split("\n").length,
      changes,
      flags,
      companyContexts,
    },
  };
}
