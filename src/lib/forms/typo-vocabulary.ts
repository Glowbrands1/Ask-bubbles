import { COMPANY_LOCATION_ENTRIES } from "@/config/company/locations";

/**
 * The words a typo may be read as (`typo-match.ts`). Four kinds, one list:
 *
 *   the readers' own keywords — the words the chat's readers look for, which
 *   the variation report's typo variants showed are the ones a slip breaks
 *   ("coahed", "amont", "notcie", "regiter shoratge", "Manger");
 *   job-title words; store names; manual policy heading words.
 *
 * Words under five letters are never corrected, so they are not listed.
 */
const READER_WORDS = [
  "already", "amount", "attendance", "attending", "behavior", "behaviour", "coached", "coaching", "conduct",
  "conversation", "corrective", "deduct", "deduction", "demotion", "employee", "fulfilled", "issued",
  "manual", "member", "minutes", "monthly", "notice", "opened", "opening", "payroll", "performance", "policy",
  "previous", "register", "resigned", "resignation", "schedule", "scheduled", "shortage", "should",
  "standards", "tardiness", "absenteeism", "termination", "verbal", "violating", "violation", "warning",
  "worked", "written",
];

const TITLE_WORDS = ["assistant", "associate", "director", "district", "keyholder", "leader", "makery", "manager", "member", "regional", "store", "supervisor", "training"];

const HEADING_WORDS = [
  "animals", "harassment", "media", "phone", "safety", "smart", "social", "theft", "visitors", "workplace",
];

function placeWords(): string[] {
  return COMPANY_LOCATION_ENTRIES.flatMap((store) => store.name.toLowerCase().split(/[^a-z]+/)).filter((word) => word.length >= 5);
}

let vocabulary: readonly string[] | null = null;

export function typoVocabulary(): readonly string[] {
  vocabulary ??= [...new Set([...READER_WORDS, ...TITLE_WORDS, ...HEADING_WORDS, ...placeWords()])];
  return vocabulary;
}
