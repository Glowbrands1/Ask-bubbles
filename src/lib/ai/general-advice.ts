/**
 * ============================================================================
 * LABELLED GENERAL ADVICE WHEN THE COMPANY DOCUMENTS HAVE NOTHING (GENERAL_ADVICE_ENABLED)
 * ============================================================================
 *
 * The owner, 28 Nov 2026, asked "Should the AI give clearly labelled general advice when company documents don't cover
 * something? Never for policy, pay or legal.": "yes". Until now a harmless management question the knowledge base has
 * nothing on ("how do I run a good team huddle?", "tips for giving feedback to a new hire") was answered only "the
 * knowledge base does not have that" (the agent loop's rules book and search_knowledge's note: "never answer from
 * memory").
 *
 * On: the AI may add short general advice, under the label "General advice (not from <brand> documents):", when the
 * documents have nothing on a general management question. Never on:
 *   - company policy, pay, wages, benefits, scheduling rules, discipline or Corrective Action levels, legal or HR-legal
 *     questions (`restrictedTopic`, read from the manager's own words): those keep today's answer, "not in the
 *     documents", and point to HR or their manager;
 *   - an answer that cites a company document or the policy manual (it is never mixed in);
 *   - a turn that makes, edits or opens a form card (cards stay grounded exactly as before).
 *
 * The prompt teaches it (`generalAdviceRuleLine`); the code holds it (`generalAdviceVerdict`, `settledGeneralAdvice`):
 * a label on a restricted topic, beside a citation or on a form turn is handed back once, then cut; general advice
 * written on a searched turn that cites nothing gets the label. Mechanism only: the brand comes from the app's config,
 * and no company's policies or wording are written here.
 */

export type RestrictedTopic = "policy" | "pay" | "benefits" | "scheduling" | "discipline" | "legal";

/** The label, exactly. The brand is the app's own (`appConfig().brandName`, `ACTIVE_BRAND.brandName`). */
export function generalAdviceLabel(brand: string): string {
  return `General advice (not from ${brand} documents):`;
}

/** Any app's label (its brand in the brackets), however it is cased. */
const LABEL = /general advice\s*\(\s*not from [^)\n]{0,80}?documents?\s*\)\s*:?/i;

export function carriesGeneralAdviceLabel(reply: string): boolean {
  return LABEL.test(reply);
}

/** What a restricted topic is called in the reply that points to HR. */
const TOPIC_WORDS: Readonly<Record<RestrictedTopic, string>> = {
  policy: "company policy",
  pay: "pay and wages",
  benefits: "benefits",
  scheduling: "scheduling rules",
  discipline: "discipline and Corrective Action",
  legal: "legal and HR-legal matters",
};

export function restrictedTopicWords(topic: RestrictedTopic): string {
  return TOPIC_WORDS[topic];
}

/*
 * THE TOPICS GENERAL ADVICE NEVER TOUCHES, read from the manager's words. Wide on purpose: a question read as restricted
 * by mistake gets today's answer ("not in the documents", HR or your manager), never wrong advice. Legal first, so
 * "is it legal to cut her pay" reads as legal.
 */
const RESTRICTED: readonly { readonly topic: RestrictedTopic; readonly pattern: RegExp }[] = [
  {
    topic: "legal",
    pattern:
      /\b(?:legal(?:ly)?|illegal|laws?|lawsuits?|sue[ds]?|suing|attorneys?|lawyers?|discriminat\w*|harass\w*|hostile work|retaliat\w*|wrongful(?:ly)?|eeoc|osha|fmla|disabilit(?:y|ies)|accommodations?|pregnan\w*|workers'? comp\w*|unemployment|labou?r (?:laws?|board|department)|child labou?r|minors|under ?age|under 18|i-9|e-verify|immigration|unions?|unioni[sz]\w*|background checks?|drug tests?|privacy|medical|injur(?:y|ies|ed)|overtime|minimum wage|terminat\w*|firing|fired|fire (?:him|her|them|someone|somebody|an?|my|this|the|that)|let (?:him|her|them|\w+) go|dismiss\w*|lay ?offs?|laid off|racis\w*|racial|sexual\w*|gender|religio\w*|(?:leave of absence|medical leave|maternity|paternity|parental leave|family leave|bereavement|jury duty|military leave|unpaid leave|paid leave))\b/i,
  },
  { topic: "legal", pattern: /\b(?:ADA|OT)\b/ },
  {
    topic: "pay",
    pattern:
      /\b(?:pay(?!\s+attention)|paid|paychecks?|pay ?stubs?|payroll|wages?|salar(?:y|ies)|a raise|pay raises?|raises? for|bonus(?:es)?|commissions?|compensation|hourly rate|rate of pay|direct deposit|tip pool|deduct\w*)\b/i,
  },
  {
    topic: "benefits",
    pattern: /\b(?:benefits?|insurance|401\s?\(?k\)?|retirement|pto|paid time off|vacation (?:days?|time|hours)|sick (?:days?|time|pay|leave)|holiday pay|employee discounts?|perks?)\b/i,
  },
  {
    topic: "scheduling",
    pattern:
      /\b(?:schedul\w*|(?:lunch|meal|rest|paid|unpaid|smoke|\d+[- ]?minute) breaks?|breaks? (?:policy|rules?|time)|how (?:many|long|much) (?:\w+ )?breaks?|breaks?(?= [^.?!\n]{0,30}\bshifts?\b)|\d+[- ]?hour shifts?|on (?:a|her|his|their|my) break|time off|days? off|shift swaps?|swap(?:ping)? shifts?|clock(?:ing|ed)? (?:in|out)|timekeeping|time ?cards?|hours (?:per|a) (?:week|day)|availability)\b/i,
  },
  {
    topic: "discipline",
    pattern:
      /\b(?:disciplin\w*|corrective actions?|ca|write[- ]?ups?|writ(?:e|ing) (?:\w+ )?up|written up|warnings?|suspen\w*|probation\w*|performance improvement plans?|no[- ]call|no[- ]shows?|attendance points?|points? system|theft|steal\w*|stole)\b/i,
  },
  { topic: "discipline", pattern: /\bPIP\b/ },
  {
    topic: "policy",
    pattern:
      /\b(?:polic(?:y|ies)|handbook|manual|dress code|uniforms?|(?<!ground )rules?(?! of thumb)|allowed|permitted|required|requirements?|mandatory|procedures?|sops?|resign\w*|quit(?:s|ting)?|two weeks'? notice|notice period|drugs?|alcohol|intoxicat\w*|drunk|weapons?|guns?|social media|jba)\b/i,
  },
];

/**
 * The restricted topic the manager's words are about, or null for a general management question. `brand`: a question
 * naming the company itself ("what does <brand> do for …") is about the company, so it is policy.
 */
export function restrictedTopic(words: string, brand?: string): RestrictedTopic | null {
  const text = words.replace(/[’]/g, "'");
  for (const { topic, pattern } of RESTRICTED) if (pattern.test(text)) return topic;
  if (brand && brand.trim() !== "" && text.toLowerCase().includes(brand.toLowerCase())) return "policy";
  return null;
}

/** The rule the model is given (the agent loop's per-turn lines, the chat's system prompt), with this question's topic. */
export function generalAdviceRuleLine(brand: string, topic: RestrictedTopic | null): string {
  const label = generalAdviceLabel(brand);
  const never =
    "Never for company policy, pay, wages, benefits, scheduling rules, discipline or Corrective Action levels, or legal and HR-legal questions (termination, discrimination, harassment, leave, overtime, accommodations): for those, say it is not in the company documents and point them to HR or their manager.";
  const rule = `General advice when the company documents have nothing (the owner, 28 Nov 2026): when search_knowledge finds nothing on a general management question (running a huddle, giving feedback, motivating a team, planning a busy day), you may give short general advice after saying the documents don't cover it, starting that part with the line "${label}" exactly. ${never} General advice never states, names or implies a company policy, never goes in an answer that cites a document or the JBA Policy Manual, and never goes on a form card, a form's fields or a reply about a form.`;
  return topic ? `${rule} This question is about ${TOPIC_WORDS[topic]}: no general advice on it.` : rule;
}

/** search_knowledge's note when nothing matches (on): today's note for a restricted topic, with the HR pointer. */
export function noMatchNote(brand: string, topic: RestrictedTopic | null): string {
  if (topic) {
    return `Nothing in the company knowledge base matches. This is about ${TOPIC_WORDS[topic]}: say it is not in the company documents and point them to HR or their manager. Never answer from memory and never give general advice on it.`;
  }
  return `Nothing in the company knowledge base matches. Say so, and never state a company policy from memory. If this is a general management question, you may add short general advice, starting that part with "${generalAdviceLabel(brand)}" exactly.`;
}

/* ------------------------------------------------------------ the check --- */

const LIST_LINE = /^\s*(?:[-*•]|\d{1,2}[.)])\s+\S/m;

/** Advice-shaped: a list, or four sentences or more (a one-line "not found" or a question is not). */
export function looksLikeAdvice(reply: string): boolean {
  if (LIST_LINE.test(reply)) return true;
  return reply.split(/(?<=[.!?])\s+/).filter((sentence) => /[a-z]{3}/i.test(sentence)).length >= 4;
}

const NOT_IN_DOCUMENTS =
  /\b(?:(?:is|are)n't|is not|are not|not)\s+(?:in|covered|found|listed|mentioned|something)\b|\b(?:can't|cannot|couldn't|could not|don't|do not|didn't|did not)\s+(?:find|see|have|locate)\b|\bnothing (?:in|on|about)\b|\bno (?:company )?(?:documents?|polic(?:y|ies)|passages?|guidance|information|results?)\b|\b(?:doesn't|does not|don't|do not)\s+(?:cover|have|say|mention|address)\b/i;

export function saysNotInDocuments(text: string): boolean {
  return NOT_IN_DOCUMENTS.test(text.replace(/[’]/g, "'"));
}

const POINTS_TO_HR = /\b(?:HR|human resources|(?:your|their) (?:manager|supervisor|district manager|DM|regional manager)|district manager|regional manager)\b/i;

/** A source marker either app writes: [S2], [p.14]. */
const MARKER = /\[(?:S\d{1,2}|p\.\s?\d{1,3})\]/;

export type GeneralAdviceVerdict =
  | { readonly kind: "ok" }
  /** A label (or general advice from memory on a searched turn) on a restricted topic. */
  | { readonly kind: "restricted"; readonly topic: RestrictedTopic }
  /** A label in an answer that cites a document. */
  | { readonly kind: "mixed" }
  /** A label on a turn that made, edited or opened a form. */
  | { readonly kind: "form" }
  /** General advice, on a searched turn that cites nothing, without the label. */
  | { readonly kind: "label_missing" };

export interface GeneralAdviceTurn {
  readonly reply: string;
  /** The manager's words this turn, and the message before it (a follow-up "what about minors?" keeps its topic). */
  readonly words: string;
  readonly brand: string;
  /** This turn made, edited or opened a form (a card, a draft, a reminder card). */
  readonly formTurn: boolean;
  /** The documents this turn's reads returned (their titles): a reply naming one cites it. */
  readonly sourceTitles: readonly string[];
  /** The turn read the knowledge base or the manual, and nothing else (no roster, forms, figures or attached files). */
  readonly searchedOnly: boolean;
  /** The manager asked for something written (a message, an email): not advice. */
  readonly drafting?: boolean;
  /** The answer shows source cards (a path that has taken its markers out already). */
  readonly cited?: boolean;
}

/** The manager asks for a text written for them: what comes back is their draft, never general advice. */
export const ASKS_FOR_WRITING = /\b(?:draft|write|compose|re-?word|rewrite|re-?phrase|summari[sz]e|translate)\b/i;

function cites(reply: string, titles: readonly string[]): boolean {
  if (MARKER.test(reply)) return true;
  if (/\bpolicy manual\b/i.test(reply)) return true;
  const lower = reply.toLowerCase();
  return titles.some((title) => title.trim().length > 3 && lower.includes(title.trim().toLowerCase()));
}

/** What the reply does with general advice, and what is wrong with it, if anything. */
export function generalAdviceVerdict(turn: GeneralAdviceTurn): GeneralAdviceVerdict {
  const reply = turn.reply.trim();
  if (reply === "") return { kind: "ok" };
  const labelled = carriesGeneralAdviceLabel(reply);
  const topic = restrictedTopic(turn.words, turn.brand);
  const cited = turn.cited === true || cites(reply, turn.sourceTitles);
  if (labelled) {
    if (turn.formTurn) return { kind: "form" };
    // Beside a citation, cutting the labelled part leaves the cited answer as it was, on any topic.
    if (cited) return { kind: "mixed" };
    if (topic) return { kind: "restricted", topic };
    return { kind: "ok" };
  }
  if (turn.formTurn || cited || !turn.searchedOnly || turn.drafting || !looksLikeAdvice(reply)) return { kind: "ok" };
  if (topic) {
    // A restricted question answered from memory: only "not in the documents" with HR or the manager is right.
    return saysNotInDocuments(reply) && POINTS_TO_HR.test(reply) && !LIST_LINE.test(reply) ? { kind: "ok" } : { kind: "restricted", topic };
  }
  return { kind: "label_missing" };
}

/** The note a hand-back gives the model (the agent loop asks once before the code settles it). */
export function generalAdviceNote(verdict: GeneralAdviceVerdict, brand: string): string {
  const label = generalAdviceLabel(brand);
  switch (verdict.kind) {
    case "restricted":
      return `[app check] This question is about ${TOPIC_WORDS[verdict.topic]}: never general advice and never an answer from memory. Say in one or two lines that it is not in the ${brand} documents, and point them to HR or their manager. Then write your reply to the manager again.`;
    case "mixed":
      return `[app check] Your reply cites a company document and also carries "${label}". General advice is never mixed into a cited answer: answer from the documents only, without the general advice. Then write your reply to the manager again.`;
    case "form":
      return `[app check] This turn is about a form, and your reply carries "${label}". Form replies stay grounded: leave the general advice out. Then write your reply to the manager again.`;
    case "label_missing":
      return `[app check] Your reply is general advice the company documents do not hold. Start that part with the line "${label}" exactly. Then write your reply to the manager again.`;
    default:
      return "";
  }
}

/** The answer for a restricted topic the documents do not cover (today's answer, with HR or their manager). */
export function restrictedReply(brand: string, topic: RestrictedTopic): string {
  return `I can't find that in the ${brand} documents, so I won't guess. For questions about ${TOPIC_WORDS[topic]}, please check with HR or your manager.`;
}

/** The reply with its labelled part (the label's paragraph to the end) left out; just the label when nothing comes before it. */
export function withoutGeneralAdvice(reply: string): string {
  const found = LABEL.exec(reply);
  if (!found) return reply.trim();
  const start = reply.lastIndexOf("\n\n", found.index);
  const before = reply.slice(0, start < 0 ? 0 : start).trim();
  if (before !== "") return before;
  // Nothing before the label: the answer is kept, only the label goes (it said "not from documents" of a cited answer).
  return reply.replace(LABEL, "").replace(/^\s+/, "").trim();
}

/** The label put on general advice: after an opening "not in the documents" paragraph, else first. */
export function withGeneralAdviceLabel(reply: string, brand: string): string {
  const label = generalAdviceLabel(brand);
  const paragraphs = reply.trim().split(/\n{2,}/);
  if (paragraphs.length > 1 && saysNotInDocuments(paragraphs[0]!)) return [paragraphs[0], `${label}\n${paragraphs.slice(1).join("\n\n")}`].join("\n\n");
  return `${label}\n${reply.trim()}`;
}

/** The code's own settling of a verdict, with no model call (after a hand-back that did not fix it, or on the chat path). */
export function settledGeneralAdvice(reply: string, verdict: GeneralAdviceVerdict, brand: string): string {
  switch (verdict.kind) {
    case "restricted": {
      const kept = carriesGeneralAdviceLabel(reply) ? withoutGeneralAdvice(reply) : "";
      if (kept === "" || carriesGeneralAdviceLabel(kept) || looksLikeAdvice(kept)) return restrictedReply(brand, verdict.topic);
      return POINTS_TO_HR.test(kept) ? kept : `${kept}\n\nFor questions about ${TOPIC_WORDS[verdict.topic]}, please check with HR or your manager.`;
    }
    case "mixed":
    case "form":
      return withoutGeneralAdvice(reply);
    case "label_missing":
      return withGeneralAdviceLabel(reply, brand);
    default:
      return reply;
  }
}
