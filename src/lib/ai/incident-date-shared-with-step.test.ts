import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formDateByRules } from "./edit-date-rules";

/**
 * INCIDENT_DATE_SHARED_WITH_STEP_ENABLED (QA's prod-env reading, 10 Nov 2026, D3). With production's flags
 * (FORM_EDIT_DATE_RULES on), "verbal for ava pellmore, gave her a verbal on 10-21 for being late on 10-21" and "ca for
 * ava pellmore, she was late on 10-21 and i gave her a verbal on 10-21" kept no incident date: every date that is also a
 * step's was set aside, even when the same day is the incident's. The wording is the NEVER-BREAK rows' in
 * `forms/form-date-incident-only.test.ts` (the person invented).
 */
const TODAY = "2026-10-25";
const FLAG = "INCIDENT_DATE_SHARED_WITH_STEP_ENABLED";

function withFlag(on: boolean): void {
  if (on) process.env[FLAG] = "true";
  else delete process.env[FLAG];
}

function dateOf(said: string, current: string | null = "2026-10-21"): string | null | undefined {
  return formDateByRules({ managerTurns: [said], question: said, today: TODAY, current });
}

const SHARED = [
  "verbal for ava pellmore, gave her a verbal on 10-21 for being late on 10-21",
  "ca for ava pellmore, she was late on 10-21 and i gave her a verbal on 10-21",
  "write up ava pellmore, i gave her a verbal on 10-21 for being late",
];

describe("INCIDENT_DATE_SHARED_WITH_STEP: the day a step was given can be the incident's day", () => {
  beforeEach(() => withFlag(false));
  afterEach(() => withFlag(false));

  for (const said of SHARED) {
    it(`flag off (as before): "${said}" sets the incident date aside`, () => {
      expect(dateOf(said)).toBeNull();
    });

    it(`flag on: "${said}" keeps 10-21`, () => {
      withFlag(true);
      // undefined: the card's own date (2026-10-21) stays.
      expect(dateOf(said)).toBeUndefined();
      expect(dateOf(said, null)).toBe("2026-10-21");
    });
  }

  for (const on of [false, true]) {
    it(`NEVER-BREAK (flag ${on ? "on" : "off"}): an earlier step's date is still not the form's`, () => {
      withFlag(on);
      // "previous coaching … for being late" is history, not the incident.
      expect(dateOf("ca for ava pellmore, she was late on 10-24. previous coaching on 10-21 for being late", "2026-10-21")).toBe("2026-10-24");
      expect(dateOf("ca for ava pellmore, late on 10-24. prior verbal on 10-21 for being late", "2026-10-21")).toBe("2026-10-24");
      expect(dateOf("ca for ava pellmore, she was late on 10-24. jba manual 10-21", "2026-10-21")).toBe("2026-10-24");
      // "i coached her on 10-21" alone (no incident cue): the step's date only.
      expect(dateOf("write up ava pellmore, late on 10-24, i coached her on 10-21", "2026-10-21")).toBe("2026-10-24");
    });
  }
});
