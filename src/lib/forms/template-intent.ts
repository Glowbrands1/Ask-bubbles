/**
 * ============================================================================
 * WHICH FORM THE MANAGER ASKED FOR — FROM THEIR OWN WORDS
 * ============================================================================
 *
 * Deliberately NOT server-only: the same reading of a sentence has to be
 * available to the preview provider in the browser, and there is nothing
 * privileged here — no database, no identity, no secret. What it returns is an
 * INTENT, never a decision: a key named here still has to resolve against the
 * published, active template library on the server before anything uses it.
 *
 * THE GRAMMAR IS PLATFORM; THE NAMES ARE COMPANY CONFIGURATION. How a request
 * is phrased ("create a … for Jane", "I need a …", "not a …") is the same at
 * any company and lives here. What the forms are CALLED is declared per form in
 * the company forms registry (`intentPhrases`), so replacing the catalog never
 * touches this file.
 *
 * ============================================================================
 * THE RULE THIS FILE EXISTS TO ENFORCE: NO DEFAULT TEMPLATE
 * ============================================================================
 *
 * "Create a form for Sarah" names no form, so it is AMBIGUOUS and the answer is
 * a question. A manager is never handed a record chosen for them by a keyword
 * list.
 */

import { COMPANY_FORMS } from "@/config/company/forms";

import { NOT_A_NAME, NOT_A_TYPED_NAME, TYPED_NAME_WORD } from "./name-words";

export type TemplateIntent =
  /** The manager named a template. Still validated against the library. */
  | { kind: "explicit"; templateKey: string }
  /** They asked for a form without saying which. Ask; never default. */
  | { kind: "ambiguous" }
  /**
   * "Coach Avery", "Avery needs coaching": a person and a verb that means
   * advice as often as it means a document. Neither is guessed — the answer
   * is one short question. Only for a form whose registry entry declares
   * `clarifyOn`. See `clarifyRequest`.
   */
  | { kind: "clarify"; templateKey: string }
  /** Not a form request at all. */
  | { kind: "none" };

/**
 * Explicit namings, mapped to LIBRARY KEYS, read from the company registry.
 * The template's own name is always a naming, so a form a person can see in
 * the library can always be asked for by that name.
 */
function templateIntents(): { key: string; matchers: string[] }[] {
  return COMPANY_FORMS.map((entry) => ({
    key: entry.seed.key,
    matchers: [
      ...new Set(
        [entry.seed.name, entry.seed.shortName, ...entry.intentPhrases]
          .map((phrase) => phrase.toLowerCase().replace(/\s+/g, " ").trim())
          .filter((phrase) => phrase.length > 2),
      ),
    ],
  }));
}

const TEMPLATE_INTENT = templateIntents();

/* ------------------------------------------------------- canonical words -- */

/** Edits between two words, a swapped pair of letters counting as one. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/*
 * "PLS MAKE A FRM FOR AVERY" IS A FORM REQUEST. The words are how people type
 * on a phone between guests, and none of them is ever somebody's name — so they
 * are rewritten to the canonical spelling BEFORE any matcher runs. Narrow on
 * purpose: courtesy shorthand and the form noun's own typos only.
 */
const COURTESY_SHORTHAND: [RegExp, string][] = [
  [/\b(?:pls|plz|plse|pleez)\b/gi, "please"],
  // Lower case only: a capital "U" can be a surname initial.
  [/\bu\b/g, "you"],
  [/\b(?:frm|fom|fomr|forn)\b/gi, "form"],
  [/\b(?:frms|froms|fomrs)\b/gi, "forms"],
];

/** Shorthand and near-miss spellings of the form's own words; everything else unchanged. */
export function canonicalShorthand(text: string): string {
  let out = text;
  for (const [pattern, replacement] of COURTESY_SHORTHAND) out = out.replace(pattern, replacement);
  return out.replace(/\b[a-z]{4,}\b/gi, (word) => {
    // A one-edit typo of a single-word form name ("chekin") reads as the name.
    const lower = word.toLowerCase();
    for (const entry of TEMPLATE_INTENT) {
      for (const matcher of entry.matchers) {
        if (matcher.includes(" ") || matcher.length < 6) continue;
        if (lower !== matcher && editDistance(lower, matcher) === 1) return matcher;
      }
    }
    return word;
  });
}

/** Every rewrite a form request goes through before it is read. */
export function canonicalFormWording(text: string): string {
  return canonicalShorthand(text);
}

/** The sentence a form-picker card sends through the composer. */
export function formRequestPhrase(templateName: string): string {
  return `Create a ${templateName} from this conversation.`;
}

/* ---------------------------------------------------------- vocabulary --- */

/**
 * Phrases that ask for A form without naming one. "write up" is here because,
 * without a named form behind it, it names no document.
 */
const AMBIGUOUS_FORM_REQUEST = [
  "create a form",
  "create form",
  "create me a form",
  "build a form",
  "build me a form",
  "make a form",
  "make me a form",
  "start a form",
  "new form",
  "draft a form",
  "draft me a form",
  "fill out a form",
  "need a form",
  "need a new form",
  "need a blank form",
  "need to fill out a form",
  "need a form for",
  "looking for a form",
  "get me a form",
  "send me a form",
  "pull up a form",
  "write up",
  "write-up",
];

const CREATION_VERBS = [
  "create",
  "start",
  "draft",
  "make",
  "open",
  "write up",
  "fill out",
  "generate",
  "prepare",
  "need a",
  "need an",
  "pull up",
  "bring up",
  "get me",
  "fill in",
  "begin",
  "set up",
  "put together",
  "i need",
  "we need",
];

/** Words that describe the library rather than a person. */
const LIBRARY_NAME_WORDS = [
  "employee",
  "team",
  "member",
  "report",
  "record",
  "template",
  "location",
  "store",
  "locations",
  "stores",
  "paperwork",
  "ft",
  "pt",
];

export const FORM_VOCABULARY: ReadonlySet<string> = new Set(
  [
    ...TEMPLATE_INTENT.flatMap((entry) => entry.matchers),
    ...AMBIGUOUS_FORM_REQUEST,
    ...LIBRARY_NAME_WORDS,
    "form",
    "forms",
  ]
    .flatMap((phrase) => phrase.split(/[\s/()-]+/))
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1),
);

/** True when a word is part of how the business names its forms. */
export function isFormVocabulary(word: string): boolean {
  return FORM_VOCABULARY.has(word.toLowerCase());
}

/* -------------------------------------------------------- leading names --- */

const HEAD_NOUN = /\s+(?:forms?|paperwork|documents?|write[- ]?ups?|writeup|note)$/;

const FORM_HEADS: readonly { key: string; phrase: string }[] = (() => {
  const seen = new Set<string>();
  const heads: { key: string; phrase: string }[] = [];
  for (const entry of TEMPLATE_INTENT) {
    for (const matcher of entry.matchers) {
      for (const phrase of [matcher, matcher.replace(HEAD_NOUN, "")]) {
        if (phrase.length < 3 || seen.has(phrase)) continue;
        seen.add(phrase);
        heads.push({ key: entry.key, phrase });
      }
    }
  }
  // Longest first, so a longer name is never read as a shorter one inside it.
  return heads.sort((a, b) => b.phrase.length - a.phrase.length);
})();

/** Every way a form can be named, as one regex alternation. */
export const FORM_NAME_PATTERN = FORM_HEADS.map((head) =>
  head.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"),
).join("|");

const LEADING_PREFIX =
  /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:create|make|start|draft|open|do|fill\s+out|fill\s+in|generate|prepare|pull\s+up|bring\s+up|get\s+me|give\s+me|send\s+me|i\s+need|we\s+need|need|begin|new)\s+)?(?:(?:a|an|the|another|new|a\s+new)\s+)?/;

const WRAPPING = /^[(\[{"“‘'«]+|[)\]}"”’'»,.;:!?]+$/g;

function couldBeName(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const word = raw.replace(WRAPPING, "");
  const lower = word.toLowerCase();
  return (
    TYPED_NAME_WORD.test(word) &&
    word.length > 1 &&
    !NOT_A_NAME.has(lower) &&
    !NOT_A_TYPED_NAME.has(lower) &&
    !FORM_VOCABULARY.has(lower)
  );
}

export interface LeadingFormRequest {
  templateKey: string;
  /** The words that followed the form's name, when they could be a person's. */
  subject: string[];
}

const NAME_RUN_ENDS = new Set([
  "about", "regarding", "re", "on", "for", "because", "since", "who", "she", "he", "they",
  "today", "yesterday", "was", "is", "has", "had", "did", "and", "but", "at", "in", "with",
  "from", "to", "after", "before", "please",
]);

const WH_QUESTION =
  /^(?:so\s+|ok\s+|okay\s+|and\s+|but\s+)?(?:what|what's|whats|how|how's|when|why|which|who|whom|whose)\b/;

/**
 * A message that LEADS with a form's name: "check-in for Jane Doe",
 * "Check-in form — Jane Doe". The name of the form, then (optionally) who it is
 * for. Returns null for anything that does not open that way.
 */
export function leadingFormRequest(text: string): LeadingFormRequest | null {
  const typed = canonicalFormWording((text ?? "").replace(/\s+/g, " ").trim());
  const lower = typed.toLowerCase();
  const prefix = LEADING_PREFIX.exec(lower)?.[0] ?? "";
  const afterPrefix = lower.slice(prefix.length);
  const head = FORM_HEADS.find(
    (entry) =>
      afterPrefix.startsWith(entry.phrase) && !/[a-z0-9]/.test(afterPrefix.charAt(entry.phrase.length)),
  );
  if (!head) return null;

  let rest = typed.slice(prefix.length + head.phrase.length);
  rest = rest.replace(/^\s+(?:forms?|paperwork|documents?)\b/i, "").trim();

  const found = (subject: string[]): LeadingFormRequest => ({ templateKey: head.key, subject });
  if (rest === "" || /^[.!]+$/.test(rest)) return found([]);
  if (/^(?:[,:;]|[-–—]\s)/.test(rest)) {
    const after = rest.replace(/^[,:;\s–—-]+/, "");
    const lowered = after.toLowerCase();
    const question = lowered.endsWith("?") && WH_QUESTION.test(lowered);
    if (question && !/\bwhat (?:do|would) you need\b/.test(lowered)) return null;
    return found(nameAfterSeparator(after));
  }

  const introduced = /^(?:for|about|regarding)\s+(.+)$/i.exec(rest);
  if (introduced) {
    const words = introduced[1]!.split(" ");
    return couldBeName(words[0]) ? found(words) : null;
  }

  const beforeBreak = rest.split(/\s*(?:[,;:]|\s[-–—]\s)/)[0]!.replace(/[.!]+$/, "");
  const named = beforeBreak.split(" ").filter(Boolean);
  if (named.length >= 1 && named.length <= 3 && named.every((word) => couldBeName(word))) return found(named);

  const words = rest.split(" ").map((word) => word.replace(WRAPPING, ""));
  const run: string[] = [];
  while (run.length < 2 && couldBeName(words[run.length])) run.push(words[run.length]!);
  const next = words[run.length]?.toLowerCase();
  if (run.length > 0 && next !== undefined && NAME_RUN_ENDS.has(next)) return found(run);
  return null;
}

function nameAfterSeparator(after: string): string[] {
  const clause = after.split(/\s*(?:[,;:.!?]|\s[-–—]\s)/)[0] ?? "";
  const words = clause.split(" ").filter(Boolean).map((word) => word.replace(WRAPPING, ""));
  if (words.length < 2 || words.length > 3) return [];
  if (/ing$/i.test(words[0]!)) return [];
  return words.every((word) => couldBeName(word)) ? words : [];
}

/* ------------------------------------------------------------- matching --- */

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mentions(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(haystack);
}

function occurrences(haystack: string, phrase: string): [number, number][] {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...haystack.matchAll(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "g"))].map(
    (match) => [match.index!, match.index! + match[0].length],
  );
}

function askedAbout(q: string, phrase: string): boolean {
  const sentence = q.split(/(?<=[.!?])\s+|\n+/).find((part) => mentions(part, phrase));
  return sentence !== undefined && WH_QUESTION.test(sentence.trim());
}

/** "not a check-in", "instead of a check-in": the naming is what they do NOT want. */
const NEGATED_BEFORE =
  /(?:\bnot|\bno|\binstead\s+of|\brather\s+than|\bisn'?t|\bnor)\s+(?:(?:a|an|the)\s+)?$/;

/** "the topic is scheduling": the naming is the subject, not the form. */
const TOPIC_BEFORE =
  /(?:\btopics?(?:\s+(?:is|was|=))?\s*:?|\bsubject(?:\s+(?:is|was))?\s*:?|\breason(?:\s+(?:is|was))?\s*:?|\babout|\bregarding|\bre:?|\bconcerning|\bover)\s+(?:(?:a|an|the|her|his|their|our)\s+)?$/;

/** "make it a check-in instead": the later naming is a switch and wins. */
const SWITCH_BEFORE =
  /(?:\bmake\s+(?:it|this|that)|\bswitch(?:\s+(?:it|this|that))?\s+to|\bchange\s+(?:it|this|that)\s+to|\binstead(?:\s+do)?|\bactually(?:\s+(?:do|use|want))?)\s+(?:(?:a|an|the)\s+)?$/;

/**
 * The form the sentence asks for, when it names one it WANTS.
 *
 * 1. Overlapping namings: the longer phrase keeps the span.
 * 2. Negated namings and topic mentions are dropped.
 * 3. A switch ("make it a … instead") wins.
 * 4. A form the message leads with wins.
 * 5. Otherwise the earliest wanted naming.
 */
function requestedNaming(q: string, original: string): { key: string; phrase: string } | null {
  type Naming = { key: string; phrase: string; start: number; end: number };
  const found: Naming[] = [];
  for (const entry of TEMPLATE_INTENT) {
    for (const phrase of entry.matchers) {
      for (const [start, end] of occurrences(q, phrase)) found.push({ key: entry.key, phrase, start, end });
    }
  }
  if (found.length === 0) return null;

  const spans = found
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
    .filter(
      (naming, index, all) =>
        !all
          .slice(0, index)
          .some((kept) => kept.start < naming.end && naming.start < kept.end && kept !== naming),
    );

  const wanted = spans.filter((naming) => {
    const before = q.slice(0, naming.start);
    return !NEGATED_BEFORE.test(before) && !TOPIC_BEFORE.test(before);
  });
  if (wanted.length === 0) return null;

  const switched = wanted.find((naming) => SWITCH_BEFORE.test(q.slice(0, naming.start)));
  if (switched) return switched;

  const leading = leadingFormRequest(original);
  if (leading) {
    const led = wanted.find((naming) => naming.key === leading.templateKey);
    if (led) return led;
  }

  return [...wanted].sort((a, b) => a.start - b.start)[0]!;
}

/** "I don't need a form", "no paperwork": a refusal is never a request. */
const DECLINES_FORM =
  /\b(?:(?:don'?t|do\s+not|doesn'?t|does\s+not|didn'?t)\s+(?:want|need)|not\s+(?:ready\s+for|looking\s+for)|no\s+need\s+for)\s+(?:(?:a|an|the|any)\s+)?(?:actual\s+|real\s+|official\s+)?(?:[a-z-]+\s+){0,2}?(?:form|forms|document|paperwork|write[- ]?up)\b|\bno\s+(?:actual\s+)?(?:form|forms|paperwork)\b|\bnot\s+(?:a|an)\s+(?:actual\s+)?form\b|\b(?:never\s*mind|forget)\s+(?:the|this|that)\s+form\b|\b(?:form|forms|paperwork)\s+not\s+yet\b/;

const COMPARISON_CUE =
  /\b(?:differences?\s+between|difference|differ(?:s|ent|ence)?|vs\.?|versus|compare[sd]?|comparing|comparison|compared\s+(?:to|with)|instead\s+of|rather\s+than)\b/;
const EXPLANATION_CUE =
  /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:explain|describe|define|clarify|tell\s+me\s+(?:about|more\s+about|what|when|why|how|which)|help\s+me\s+understand|what(?:'s|s|\s+is|\s+are)|meaning\s+of|purpose\s+of|overview\s+of)\b/;
const USAGE_CUE =
  /\b(?:when\s+(?:do|should|would|can|could|to|is|are)\b|which\s+(?:form|forms|one|document)\b|used?\s+for\b|use\s+(?:it|one|them)\b)/;
const WH_ANYWHERE = /\b(?:what|what's|whats|how|when|why|which)\b/;
const OPENS_WITH_MAKING =
  /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:create|make|start|draft|open|begin|prepare|generate|fill\s+out|fill\s+in|write\s+(?:up|her\s+up|him\s+up|them\s+up)|do\s+(?:a|an)|i\s+need\s+(?:a|an|to\s+(?:do|write|create|make|start))|we\s+need\s+(?:a|an|to))\b/;
const EXISTENCE_QUESTION =
  /^(?:so\s+|and\s+)?(?:(?:do|does|did)\s+(?:we|you|i|they)\s+(?:have|offer|keep|use)|(?:is|are)\s+there|have\s+(?:we|you)\s+got|(?:can|could)\s+(?:i|we)\s+(?:find|get))\b/;

function formsNamed(q: string): number {
  const keys = new Set<string>();
  for (const entry of TEMPLATE_INTENT) if (entry.matchers.some((phrase) => mentions(q, phrase))) keys.add(entry.key);
  return keys.size;
}

function requestsCreation(q: string, original: string): boolean {
  if (OPENS_WITH_MAKING.test(q)) return true;
  const leading = leadingFormRequest(original);
  if (leading && leading.subject.length > 0) return true;
  return [...q.matchAll(/\bfor\s+(\S+)/g)].some((match) => couldBeName(match[1]));
}

/**
 * Whether the message asks ABOUT forms rather than for one: "what is the
 * check-in form for?", "do we have a check-in form?". A question about the
 * library is answered from the library; it never proposes a form.
 */
export function asksAboutForms(question: string): boolean {
  const original = canonicalShorthand((question ?? "").replace(/\s+/g, " ").trim());
  const q = normalize(original);
  if (requestsCreation(q, original)) return false;
  if (/\bwhat\s+(?:do|would)\s+you\s+need\b/.test(q)) return false;
  if (COMPARISON_CUE.test(q)) return true;
  if (/\bor\b/.test(q) && formsNamed(q) >= 2) return true;
  if (EXPLANATION_CUE.test(q) || USAGE_CUE.test(q)) return true;
  const naming = q.split(/(?<=[.!?])\s+|\n+/).find((part) => formsNamed(part) > 0) ?? q;
  if (WH_ANYWHERE.test(naming)) return true;
  if (EXISTENCE_QUESTION.test(q)) return false;
  return /\?\s*$/.test(q);
}

/* ---------------------------------------------------- advice or a form? -- */

/**
 * ============================================================================
 * "COACH AVERY" — ADVICE, OR THE FORM? ASKED, NOT GUESSED
 * ============================================================================
 *
 * Ported from the reference platform's `coachingRequest`, generalised: the
 * verb and noun come from the form's registry entry (`clarifyOn`) rather than
 * being one company's coaching words. "Coach Avery", "I need to coach Avery"
 * and "Avery needs coaching" mean the conversation as often as the record,
 * and a form on somebody's file is not a coin toss — so the answer is one
 * short question with a chip for each reading.
 *
 * NEVER FOR A QUESTION OR AN ADVICE REQUEST: "how should I coach Avery?",
 * "coach me through this", "tips" stay with the knowledge base.
 */
const CLARIFY_QUESTION_START =
  /^(?:what|how|when|where|why|who|which|does|do|did|is|are|can|could|should|would|will|may|has|have)\b/;
const CLARIFY_ADVICE_CUE =
  /\b(?:how\s+(?:do|should|can|would|could)\s+(?:i|we)|what\s+should\s+(?:i|we)|tips?|advice|guidance|ideas?|help\s+me\s+(?:figure|understand|prepare|plan|think|with))\b/;

function escapeWord(word: string): string {
  return word.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

/** Whether a naming is a form's bare clarify noun — "coaching", not "coaching note". */
function isClarifyNoun(phrase: string): boolean {
  const normalized = phrase.toLowerCase().replace(/\s+/g, " ").trim();
  return COMPANY_FORMS.some((entry) => entry.clarifyOn?.noun.toLowerCase().trim() === normalized);
}

function clarifyRequest(q: string): string | null {
  const polite = /^(?:please\s+)?(?:can|could|would|will)\s+you\b/.test(q);
  if (((CLARIFY_QUESTION_START.test(q) || /\?\s*$/.test(q)) && !polite) || CLARIFY_ADVICE_CUE.test(q)) return null;
  for (const entry of COMPANY_FORMS) {
    if (!entry.clarifyOn) continue;
    const verb = escapeWord(entry.clarifyOn.verb);
    const noun = escapeWord(entry.clarifyOn.noun);
    if (new RegExp(`\\b${verb}\\s+(?:me|us)\\b`).test(q)) continue;
    const verbAPerson = new RegExp(
      `^(?:(?:ok(?:ay)?|so|well|hey|hi)[,\\s]+)?(?:i\\s+|we\\s+)?(?:(?:need|have|got|want|am\\s+going|going|plan)\\s+to\\s+|gotta\\s+|gonna\\s+|should\\s+|will\\s+|must\\s+|let'?s\\s+)?${verb}\\s+(\\S+)`,
    );
    const personNeeds = new RegExp(
      `^(\\S+)(?:\\s+(\\S+))?(?:\\s+(\\S+))?\\s+(?:needs|need|requires|could\\s+use|should\\s+get)\\s+(?:some\\s+|more\\s+)?${noun}\\b(?!\\s+(?:form|document|note|record))`,
    );
    const verbed = verbAPerson.exec(q);
    if (verbed && couldBeName(verbed[1])) return entry.seed.key;
    const needs = personNeeds.exec(q);
    if (needs && [needs[1], needs[2], needs[3]].filter(Boolean).every((word) => couldBeName(word))) {
      return entry.seed.key;
    }
  }
  return null;
}

/**
 * What the manager asked for: a named template, a form without a name, or
 * nothing to do with forms.
 */
export function detectTemplateIntent(question: string): TemplateIntent {
  const q = canonicalFormWording(normalize(question ?? ""));
  if (q === "") return { kind: "none" };
  const informational = asksAboutForms(question);

  if (DECLINES_FORM.test(q)) return { kind: "none" };

  /*
   * BEFORE THE NAMINGS: a form whose registry phrases include its bare noun
   * ("coaching") would otherwise read "Avery needs coaching" as a request.
   */
  const clarify = informational ? null : clarifyRequest(q);
  if (clarify) return { kind: "clarify", templateKey: clarify };

  const requested = requestedNaming(q, question);
  if (requested) {
    if (informational || askedAbout(q, requested.phrase)) return { kind: "none" };
    /*
     * "TIPS FOR COACHING AVERY" IS ADVICE. A registry may list a form's bare
     * noun ("coaching") as a naming; said beside an advice cue, that noun is
     * the subject of the question, not a request for the record.
     */
    if (CLARIFY_ADVICE_CUE.test(q) && isClarifyNoun(requested.phrase)) return { kind: "none" };
    return { kind: "explicit", templateKey: requested.key };
  }

  const leading = informational ? null : leadingFormRequest(question);
  if (leading) return { kind: "explicit", templateKey: leading.templateKey };

  if (informational) return { kind: "none" };

  if (
    AMBIGUOUS_FORM_REQUEST.some((phrase) => mentions(q, phrase)) ||
    (CREATION_VERBS.some((verb) => mentions(q, verb)) && /\b(?:form|paperwork|document)\b/.test(q))
  ) {
    return { kind: "ambiguous" };
  }

  return { kind: "none" };
}
