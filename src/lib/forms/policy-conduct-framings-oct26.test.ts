import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import rows from "@/test/fixtures/jba-manual-production-151.json";
import { accountManualSections } from "@/lib/ai/account-manual-sections";
import { citedSections } from "@/lib/ai/violation-policy";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import { readCaPolicy } from "./ca-policy";
import type { ManualChunk } from "./official-policy-manual";

/**
 * ============================================================================
 * THE SAME CONDUCT ACCOUNT, CA OR COACHING (POLICY_CONDUCT_WORDING_ENABLED)
 * ============================================================================
 *
 * QA's live policy map, 26 Oct 2026 (name invented): "talking bad about
 * coworkers" and "didn't complete policy acknowledgements in woven during
 * onboarding" must read as the Standards of Conduct p.12 on a Corrective
 * Action card and on a coaching card, in the managers' framings. Run with the
 * flags Ask Bubbles production has on.
 */

const CHUNKS: readonly ManualChunk[] = (rows.chunks as ManualChunkRow[]).map((row) => {
  const chunk = manualChunkFromRow(row);
  return { ...chunk, page: chunk.page ?? null, locator: chunk.locator ?? undefined };
});

/** The flags on in Ask Bubbles production, 26 Oct 2026. */
const LIVE = [
  "ACTION_PLAN_MANAGER_ONLY_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
  "APP_PASSWORD_HELP_ENABLED",
  "CA_TEMPLATE_MAP_ENABLED",
  "CHAT_TRACE_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
  "CROSS_CHAT_REPLY_GUARD_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED",
  "FIELD_ACCURACY_ENABLED",
  "FORM_CHOICE_STATED_ENABLED",
  "FORM_FULL_REMAP_ENABLED",
  "FORM_STATE_ENABLED",
  "FULL_MANUAL_CONTEXT_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
  "GOOGLE_REVIEWS_SCHEDULE_ENABLED",
  "GOOGLE_REVIEWS_SYNC_ENABLED",
  "GOOGLE_REVIEWS_WRITES_ENABLED",
  "GROUNDED_ENTITIES_ENABLED",
  "INTENT_EXTRACTION_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "MANUAL_NEGATED_LIST_NOTE_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "PROMPT_CACHE_ENABLED",
  "REMAP_DRAFT_SOURCES_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED",
  "SLOT_RETENTION_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED",
  "TYPED_NAME_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "WOVEN_SYNC_ENABLED",
  "WOVEN_SYNC_SCHEDULE_ENABLED",
  "WOVEN_SYNC_WRITES_ENABLED",
  "WOVEN_VALIDATION_ENABLED",
] as const;

afterEach(() => vi.unstubAllEnvs());
// Flag-off pins hold whatever the environment has on; flag-on tests set it.
beforeEach(() => vi.stubEnv("POLICY_CONDUCT_WORDING_ENABLED", ""));

const ACCOUNTS = ["talking bad about coworkers", "didn't complete policy acknowledgements in woven during onboarding"];
const FRAMINGS = [
  (account: string) => `ca for devon harlan ${account}`,
  (account: string) => `coaching form for devon harlan ${account}`,
  (account: string) => `Create a corrective action for Devon Harlan, ${account}`,
  (account: string) => `Create a coaching form for Devon Harlan, ${account}`,
];
const TURNS = ACCOUNTS.flatMap((account) => FRAMINGS.map((frame) => frame(account))).flatMap((text) => [text, text.toUpperCase()]);

describe("live flags + POLICY_CONDUCT_WORDING_ENABLED", () => {
  const on = () => {
    for (const name of LIVE) vi.stubEnv(name, "true");
    vi.stubEnv("POLICY_CONDUCT_WORDING_ENABLED", "true");
  };

  it.each(TURNS)("%s reads as the Standards of Conduct p.12, on the card too", (text) => {
    on();
    expect(readCaPolicy(text).suggestion).toBe("standards_of_conduct");
    expect(accountManualSections(text, CHUNKS).map((section) => `${section.heading} p.${section.page}`)).toEqual(["Standards of Conduct p.12"]);
    expect(citedSections([text], CHUNKS).map((entry) => `${entry.section} p.${entry.page}`)).toEqual(["Standards of Conduct p.12"]);
  });
});
