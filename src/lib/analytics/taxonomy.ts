import { COMPANY_TOPIC_TERMS } from "@/config/company/analytics";
import type { KnowledgeCategory } from "@/types";

/**
 * ============================================================================
 * ADOPTION ANALYTICS — WHAT A TURN WAS ABOUT, AND WHERE IT HAPPENED
 * ============================================================================
 *
 * Platform categories, mirrored by the `activity_feature`, `activity_category`,
 * `activity_surface` and `activity_turn_kind` enums. The vocabulary used to
 * label a free-text question is company configuration
 * (`src/config/company/analytics.ts`).
 *
 * THE EVIDENCE LADDER, strongest first — see `classifyChatTurn`:
 *   1. the template the answer proposed     (a fact about the answer)
 *   2. an attached report                   (a fact about the request)
 *   3. the knowledge categories it cited    (metadata on the documents)
 *   4. the question, read transiently       (only when 1–3 found none)
 */

export const ACTIVITY_FEATURES = ["chat", "forms", "knowledge", "reports"] as const;

export type ActivityFeature = (typeof ACTIVITY_FEATURES)[number];

export const ACTIVITY_CATEGORIES = [
  "form_created",
  "form_request",
  "team_guidance",
  "policy_question",
  "store_operations",
  "equipment_procedures",
  "training",
  "guest_experience",
  "pay_benefits",
  "safety_compliance",
  "hiring_onboarding",
  "reporting",
  "report_analysis",
  "report_upload",
  "document_upload",
  "document_search",
  "general_guidance",
  "unclassified",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const FEATURE_LABEL: Record<ActivityFeature, string> = {
  chat: "Ask Bubbles",
  forms: "Forms",
  knowledge: "Knowledge Base",
  reports: "Reports",
};

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  form_created: "Forms proposed",
  form_request: "Form requests (form not named)",
  team_guidance: "Team & coaching guidance",
  policy_question: "Policy questions",
  store_operations: "Store operations",
  equipment_procedures: "Equipment & procedures",
  training: "Training",
  guest_experience: "Guest experience & product",
  pay_benefits: "Pay & benefits",
  safety_compliance: "Safety & compliance",
  hiring_onboarding: "Hiring & onboarding",
  reporting: "Reporting questions",
  report_analysis: "Report analysis",
  report_upload: "Report ingestions",
  document_upload: "Document uploads",
  document_search: "Knowledge searches",
  general_guidance: "General guidance",
  unclassified: "Unclassified",
};

export const CATEGORY_FEATURE: Record<ActivityCategory, ActivityFeature> = {
  form_created: "forms",
  form_request: "chat",
  team_guidance: "chat",
  policy_question: "chat",
  store_operations: "chat",
  equipment_procedures: "chat",
  training: "chat",
  guest_experience: "chat",
  pay_benefits: "chat",
  safety_compliance: "chat",
  hiring_onboarding: "chat",
  reporting: "chat",
  report_analysis: "reports",
  report_upload: "reports",
  document_upload: "knowledge",
  document_search: "knowledge",
  general_guidance: "chat",
  unclassified: "chat",
};

export function isActivityCategory(value: unknown): value is ActivityCategory {
  return ACTIVITY_CATEGORIES.includes(value as ActivityCategory);
}

export function isActivityFeature(value: unknown): value is ActivityFeature {
  return ACTIVITY_FEATURES.includes(value as ActivityFeature);
}

export function categoryLabel(key: string): string {
  return isActivityCategory(key) ? CATEGORY_LABEL[key] : key;
}

export function featureLabel(key: string): string {
  return isActivityFeature(key) ? FEATURE_LABEL[key] : key;
}

/** A proposed template is a form turn, whichever form it is. */
export function categoryForTemplateKey(
  key: string | null | undefined,
  templateCategory?: string | null,
): ActivityCategory | null {
  void templateCategory;
  return key && key.trim() ? "form_created" : null;
}

export function categoryForKnowledgeCategory(category: KnowledgeCategory): ActivityCategory | null {
  switch (category) {
    case "leadership_coaching":
      return "team_guidance";
    case "policies_compliance":
      return "policy_question";
    case "operations":
      return "store_operations";
    case "equipment_procedures":
      return "equipment_procedures";
    case "training":
      return "training";
    case "sales_client_experience":
      return "guest_experience";
    case "bonuses_compensation":
      return "pay_benefits";
    case "safety":
      return "safety_compliance";
    case "reports_analytics":
      return "reporting";
    case "other":
      return null;
  }
}

const TOPIC_TERMS_BY_LENGTH: readonly [string, ActivityCategory][] = Object.entries(COMPANY_TOPIC_TERMS)
  .flatMap(([category, terms]) =>
    (terms ?? []).map((term) => [term.toLowerCase(), category as ActivityCategory] as [string, ActivityCategory]),
  )
  .sort((a, b) => b[0].length - a[0].length);

/** The topic a question names, by the company's vocabulary, or null. */
export function classifyQuestionText(question: string): ActivityCategory | null {
  const haystack = ` ${question.toLowerCase().replace(/[^a-z0-9:]+/g, " ").trim()} `;
  if (haystack.trim().length === 0) return null;
  for (const [term, category] of TOPIC_TERMS_BY_LENGTH) {
    if (haystack.includes(` ${term} `)) return category;
  }
  return null;
}

export interface ChatTurnEvidence {
  proposedTemplateKey?: string | null;
  offeredFormChoices?: boolean;
  hadReportContext: boolean;
  citedCategories: KnowledgeCategory[];
  question?: string | null;
}

export function classifyChatTurn(evidence: ChatTurnEvidence): ActivityCategory {
  const fromTemplate = categoryForTemplateKey(evidence.proposedTemplateKey);
  if (fromTemplate) return fromTemplate;

  if (evidence.offeredFormChoices) return "form_request";

  if (evidence.hadReportContext) return "report_analysis";

  const fromCitations = dominantCitationCategory(evidence.citedCategories);
  if (fromCitations) return fromCitations;

  const question = evidence.question?.trim() ?? "";
  if (question.length > 0) {
    return classifyQuestionText(question) ?? "general_guidance";
  }

  return "unclassified";
}

function dominantCitationCategory(categories: KnowledgeCategory[]): ActivityCategory | null {
  const counts = new Map<ActivityCategory, number>();
  let best: ActivityCategory | null = null;
  let bestCount = 0;
  for (const knowledge of categories) {
    const mapped = categoryForKnowledgeCategory(knowledge);
    if (!mapped) continue;
    const next = (counts.get(mapped) ?? 0) + 1;
    counts.set(mapped, next);
    if (next > bestCount) {
      best = mapped;
      bestCount = next;
    }
  }
  return best;
}

/**
 * WHERE A TURN HAPPENED. `report` covers every "ask about this report"
 * panel; which report it was is the turn's report context, so a new report
 * needs no enum change.
 */
export const ACTIVITY_SURFACES = ["main_chat", "overview", "report", "unknown"] as const;

export type ActivitySurface = (typeof ACTIVITY_SURFACES)[number];

export const SURFACE_LABEL: Record<ActivitySurface, string> = {
  main_chat: "Ask Bubbles chat",
  overview: "Home",
  report: "Reports",
  unknown: "Not recorded",
};

export function isActivitySurface(value: unknown): value is ActivitySurface {
  return (ACTIVITY_SURFACES as readonly unknown[]).includes(value);
}

/* ===========================================================================
 * QUESTION, OR ONLY AN ACKNOWLEDGEMENT
 * ===========================================================================
 *
 * Mirrors `public.activity_turn_kind`. In a conversational assistant the most
 * common thing anybody types is "yes"; counting it as a question would inflate
 * every adoption figure.
 */
export const ACTIVITY_TURN_KINDS = [
  "question",
  "acknowledgement",
  "not_applicable",
] as const;

export type ActivityTurnKind = (typeof ACTIVITY_TURN_KINDS)[number];

/**
 * The whole message, normalised, must be one of these to count as an
 * acknowledgement.
 *
 * WHOLE-STRING EQUALITY, NEVER A PREFIX OR A SUBSTRING, and that is the rule
 * this list lives or dies by. "yes" is an acknowledgement; "yes, but why is
 * Wornall down on PPTA?" is a question that happens to start with the word, and
 * a prefix match would throw away the most interesting turns in the log —
 * exactly the follow-ups where somebody pushed back on an answer.
 */
const ACKNOWLEDGEMENTS: ReadonlySet<string> = new Set([
  "y",
  "yes",
  "yes please",
  "yes pls",
  "yep",
  "yeah",
  "yea",
  "ya",
  "sure",
  "ok",
  "okay",
  "k",
  "kk",
  "got it",
  "understood",
  "sounds good",
  "perfect",
  "great",
  "awesome",
  "nice",
  "cool",
  "thanks",
  "thank you",
  "thank you so much",
  "thanks so much",
  "thank u",
  "thx",
  "ty",
  "tysm",
  "no",
  "nope",
  "nevermind",
  "never mind",
  "n/a",
  "done",
  "correct",
  "yes correct",
  "that works",
  "that helps",
  "looks good",
  "lgtm",
  "today",
  "yesterday",
  "tomorrow",
  "please",
  "continue",
  "go ahead",
  "proceed",
  "next",
  "more",
  "again",
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
]);

/**
 * How long a message may be and still be considered for the list above.
 *
 * A BACKSTOP, NOT THE TEST. The set membership is the test; this only stops the
 * normaliser from doing pointless work on a paragraph. It is generous enough
 * that every entry above clears it with room, and short enough that nothing
 * substantial is ever measured against the set.
 */
const ACKNOWLEDGEMENT_MAX_LENGTH = 40;

/**
 * Whether a turn carried a question or only an acknowledgement.
 *
 * NORMALISATION IS DELIBERATELY SHALLOW: case folded, surrounding whitespace
 * removed, internal runs of whitespace collapsed, and trailing punctuation
 * dropped. So "Yes!", "  yes  " and "yes." are the same acknowledgement.
 *
 * It does NOT strip accents, expand contractions or stem, because every one of
 * those transformations makes the function harder to predict and none of them
 * is needed to catch "thanks". A classifier nobody can reason about is worse
 * than one that misses an unusual spelling — the miss costs one row in a
 * ranking, and the confusion costs the panel its credibility.
 *
 * AN EMPTY OR ABSENT QUESTION IS A QUESTION, not an acknowledgement. Nothing
 * was seen, so nothing may be claimed about it, and `question` is the value
 * that leaves the turn counted where it would have been counted before.
 */
export function classifyTurnKind(question: string | null | undefined): ActivityTurnKind {
  const raw = question?.trim() ?? "";
  if (raw.length === 0 || raw.length > ACKNOWLEDGEMENT_MAX_LENGTH) return "question";

  const normalised = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    /* Trailing punctuation and emphasis only — never internal characters. */
    .replace(/[.!?,;:\s]+$/g, "")
    .trim();

  if (normalised.length === 0) return "question";
  return ACKNOWLEDGEMENTS.has(normalised) ? "acknowledgement" : "question";
}
