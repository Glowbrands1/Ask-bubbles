/**
 * ============================================================================
 * JOB TITLES AS MANAGERS TYPE THEM (COMPANY CONFIGURATION, PROVISIONAL)
 * ============================================================================
 *
 * Two uses, both conservative:
 *
 *   1. A form's Job Title is prefilled ONLY from a title the manager actually
 *      typed ("she's a shift lead") — never inferred from a template.
 *   2. A capitalised phrase that is wholly a job title ("District Manager") is
 *      never mistaken for a person's name.
 *
 * Neutral retail titles until Buff City Soap's Woven positions are confirmed.
 * "TC" / "Tanning Consultant", a reference-platform position, is not one of
 * them (removed 21 Oct 2026): "TC" is no longer read as a title, expanded, or
 * taken as the role that ends a name.
 * Order matters: most specific first, so "assistant store manager" is not
 * read as "store manager".
 */
export const COMPANY_JOB_TITLES: readonly { pattern: RegExp; title: string }[] = [
  // The role vocabulary the migrated HR forms are written in (the EPP family,
  // the Demotion and Transfer examples, the hiring forms). Read first, in the
  // reference platform's order, so EPP routing and title extraction behave
  // exactly as the forms were tested.
  { pattern: /\b(?:sdits?|(?:salon|store) directors? in training)\b/i, title: "SDIT" },
  { pattern: /\b(?:tsds?|training (?:salon|store) directors?)\b/i, title: "TSD" },
  { pattern: /\b(?:dmits?|district managers? in training)\b/i, title: "DMIT" },
  { pattern: /\b(?:fttcs?|full[- ]time tanning consultants?)\b/i, title: "FTTC" },
  { pattern: /\b(?:asds?|assistant (?:salon|store) directors?)\b/i, title: "ASD" },
  { pattern: /\b(?:sds?|(?:salon|store) directors?)\b/i, title: "Store Director" },
  { pattern: /\b(?:dm|district managers?)\b/i, title: "District Manager" },
  // Provisional Buff City Soap titles (to be confirmed by Buff).
  { pattern: /\b(?:asms?|assistant (?:store |location )?managers?)\b/i, title: "Assistant Manager" },
  { pattern: /\b(?:store|location|makery) managers?\b/i, title: "Store Manager" },
  { pattern: /\b(?:shift (?:leads?|leaders?|supervisors?)|keyholders?)\b/i, title: "Shift Lead" },
  { pattern: /\bmakery (?:associates?|team members?)\b/i, title: "Makery Associate" },
  { pattern: /\bsoap ?makers?\b/i, title: "Soap Maker" },
  { pattern: /\b(?:sales associates?|team members?)\b/i, title: "Team Member" },
  { pattern: /\b(?:rm|regional managers?)\b/i, title: "Regional Manager" },
];

/**
 * Whether a single word is a job-title ABBREVIATION — two to six letters that
 * one of the titles above reads in full ("ASM", "SD", "DM"). Case is not
 * checked here; callers that need the capitals as evidence check them.
 *
 * Used where a manager signs a person off as the paperwork does — "Brandi
 * Algya ASM Grand Island" — so the role ends the name and says a store
 * follows. Derived from the list, so it follows Buff City Soap's titles.
 */
export function isJobTitleAbbreviation(word: string): boolean {
  if (!/^[A-Za-z]{2,6}$/.test(word)) return false;
  return COMPANY_JOB_TITLES.some((entry) => word.replace(entry.pattern, "") === "");
}
