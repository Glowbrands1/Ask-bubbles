import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "SHE SUBMITED HER NOTICE ON 9/29/26": THE NOTICE DATE IS SEPTEMBER 29 (QA's October triage, 10 Nov 2026;
 * EXIT_NOTICE_VERB_TYPOS_ENABLED)
 * ============================================================================
 *
 * The manager's wording, the person from the pack's STAFF: with production's flags the misspelled "submited" names
 * no notice date, and the card leaves "Date that notice was given" blank.
 */
export const NOV11_EXIT_NOTICE_VERB_TYPOS_CASES: readonly ReplayCase[] = [
  {
    id: "nov11-exit-notice-submited",
    title: '"… her last day will be 10/12/2026 and she submited her notice on 9/29/26": the notice date is September 29, 2026',
    report: "QA's October triage (10 Nov 2026): \"she submited her notice on 9/29/26\" left the notice date blank",
    status: { open: "\"Date that notice was given\" is left blank" },
    fixFlags: ["EXIT_NOTICE_VERB_TYPOS_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const reply = await t
        .thread()
        .say("exit form for remy calder her last day will be 10/12/2026 and she submited her notice on 9/29/26");
      expect(reply.formProposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Remy Calder" });
      /*
       * CHANGED ON PURPOSE (Pau, 25 Nov 2026: "dates can NOT be entered into the Date that notice was given … UNLESS
       * Submitted & Fulfilled Notice box is checked"): nothing here says the notice was worked, so the notice date is
       * neither listed nor entered.
       */
      expect(reply.content, `notice date listed without the box:\n${reply.content}`).not.toMatch(/\*\*Date that notice was given:\*\*/);
      expect(reply.content, `last day lost:\n${reply.content}`).toMatch(/\*\*Last Day Worked:\*\*\s*October 12, 2026/);
    },
  },
];
