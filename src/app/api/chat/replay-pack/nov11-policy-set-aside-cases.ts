import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A POLICY THE MANAGER SET ASIDE LEAVES THE CARD (QA F1/M3, 25 Oct 2026; PR #172 rebuilt on main in QA's stale-PR
 * cleanup, 11 Nov 2026; POLICY_SET_ASIDE_ENABLED)
 * ============================================================================
 *
 * The managers' exact turns (conv_mvog7n9i2y26f1i, conv_mvoes60b2e1ae1b, conv_mvoflsoo26q7iig), the person invented
 * (Remy Calder, on this store's directory). After "the policy violated is late opening, not attendance" the card still
 * cited the Attendance policy (p.14) beside Late Opening (p.15).
 *
 * NO LONGER REPRODUCES ON MAIN (11 Nov 2026): with production's flags the card cites Late Opening (page 15) alone and
 * Create's Direct policy quotes Late Opening, p. 15 only, so #172 (POLICY_SET_ASIDE_ENABLED) was not rebuilt. These
 * cases hold with production's flags and keep it that way.
 */
const FIRST = "ca for Remy Calder at the store opened the store late 9-28-26 verbal ca was given 9-1-26 make it written";

function policyText(content: string): string {
  return content
    .split("\n")
    .filter((line) => /\*\*Polic(?:y|ies)\b/i.test(line) || /\bp\.\s?1[45]\b|\bpage 1[45]\b/i.test(line))
    .join("\n");
}

function setAsideCase(id: string, title: string, conversation: string, correction: string): ReplayCase {
  return {
    id,
    title,
    report: `QA F1/M3, 25 Oct 2026 (${conversation}): "${correction}" kept "Attendance Policy, JBA Policy Manual p.14" on the card beside Late Opening p.15`,
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say(FIRST, { employeeName: "Remy Calder" });
      expect(thread.proposal, `no Corrective Action card:\n${first.content}`).toMatchObject({ templateKey: "dpoa" });
      const reply = await thread.say(correction);
      expect(thread.proposal, `the card was lost:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      // The card: Late Opening, never the Attendance section (p.14). "under **Attendance Policy**" is the form's
      // offense box (Corrective Action revision 7 files a late opening there), not a citation.
      const cited = policyText(reply.content).replace(/under \*\*Attendance Policy\*\*/gi, "");
      expect(cited, `the card cites no Late Opening policy:\n${reply.content}`).toMatch(/Late Opening/i);
      expect(cited, `the card still cites the Attendance policy the manager set aside:\n${reply.content}`).not.toMatch(/\bAttendance\b|\bp\.\s?14\b|\bpage 14\b/i);
      // The draft: Direct policy quotes Late Opening, never the Attendance section the manager set aside.
      t.draftWrites({ observation: "Remy Calder opened the store late on 09/28/2026." }, { offense_type: ["attendance_policy"] });
      const id = await thread.create();
      const values = t.values(id);
      const direct = values.policy_language ?? "";
      expect(direct, `Direct policy does not quote Late Opening:\n${direct}`).toMatch(/Late Opening/i);
      expect(direct, `Direct policy still quotes the Attendance section the manager set aside:\n${direct}`).not.toMatch(/—\s*Attendance\b|\bAttendance,\s*p\.\s*14\b/i);
    },
  };
}

export const NOV11_POLICY_SET_ASIDE_CASES: ReplayCase[] = [
  setAsideCase(
    "nov11-policy-set-aside-not-attendance",
    "a late-opening CA card, then \"the policy violated is late opening, not attendance\": Late Opening only",
    "conv_mvog7n9i2y26f1i",
    "the policy violated is late opening, not attendance",
  ),
  setAsideCase(
    "nov11-policy-set-aside-instead-of",
    "a late-opening CA card, then \"can you reference the late opening policy INSTEAD of the attendance policy\": Late Opening only",
    "conv_mvoes60b2e1ae1b",
    "can you reference the late opening policy INSTEAD of the attendance policy",
  ),
  setAsideCase(
    "nov11-policy-set-aside-not-attendance-comma",
    "a late-opening CA card, then \"not attendance, late opening\": Late Opening only",
    "conv_mvoflsoo26q7iig",
    "not attendance, late opening",
  ),
];
