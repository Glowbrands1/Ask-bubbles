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
 * Order matters: most specific first, so "assistant store manager" is not
 * read as "store manager".
 */
export const COMPANY_JOB_TITLES: readonly { pattern: RegExp; title: string }[] = [
  { pattern: /\b(?:asms?|assistant (?:store |location )?managers?)\b/i, title: "Assistant Manager" },
  { pattern: /\b(?:store|location|makery) managers?\b/i, title: "Store Manager" },
  { pattern: /\b(?:shift (?:leads?|leaders?|supervisors?)|keyholders?)\b/i, title: "Shift Lead" },
  { pattern: /\bsoap ?makers?\b/i, title: "Soap Maker" },
  { pattern: /\b(?:sales associates?|team members?)\b/i, title: "Team Member" },
  { pattern: /\b(?:dm|district managers?)\b/i, title: "District Manager" },
  { pattern: /\b(?:rm|regional managers?)\b/i, title: "Regional Manager" },
];
