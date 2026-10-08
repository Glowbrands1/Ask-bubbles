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
 *   "Sunny" (the app, named on its own) → "Bubbles", possessives included.
 *
 * NOTHING ELSE IS REWRITTEN. The source company's name, its operational
 * terms and every rule stay verbatim; the report lists them so a person can
 * decide on each (`flags`). Pure: text in, text and report out.
 */

/** The app-name rules, applied in this order. */
export const APP_NAME_RULES = [
  { id: "ask_sunny_upper", pattern: /ASK SUNNY/g, replacement: "ASK BUBBLES" },
  { id: "ask_sunny_filename", pattern: /ASK_SUNNY/g, replacement: "ASK_BUBBLES" },
  { id: "ask_sunny", pattern: /Ask Sunny/g, replacement: "Ask Bubbles" },
  { id: "sunny_possessive", pattern: /\bSunny['’]s\b/g, replacement: "Bubbles’" },
  { id: "sunny_bare", pattern: /\bSunny\b/g, replacement: "Bubbles" },
];

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
  const normalized = text.replace(/\r\n?/g, "\n");
  const changes = [];
  let out = normalized;
  for (const rule of APP_NAME_RULES) {
    out = out.replace(rule.pattern, (match, offset, whole) => {
      changes.push({ rule: rule.id, line: lineOf(whole, offset), from: match, to: rule.replacement });
      return rule.replacement;
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
      linesBefore: normalized.split("\n").length,
      linesAfter: out.split("\n").length,
      changes,
      flags,
      companyContexts,
    },
  };
}
