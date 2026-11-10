import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JOIN } from "./bounded-context";
import { currentFormRequestText, currentFormRequestTurns, startsFormRequest, startsNewRequest } from "./current-request";

const FIRST = "create a corrective action for Remy Calder, he was late opening the store on 11/2";

describe("currentFormRequestTurns (SECOND_REQUEST_OWN_ACCOUNT_ENABLED; QA's audit, 7 Nov 2026)", () => {
  // Changed on purpose (QA's Sunny round-3 gate, 7 Nov 2026; ported from the sibling app): the request start is now
  // read as the Observation reads it (`ai/remap-incident.ts` currentRequestStart), whose "another / separate <form>"
  // reading is behind this flag; every caller already runs only with it on.
  beforeEach(() => vi.stubEnv("SECOND_REQUEST_OWN_ACCOUNT_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("a second request starts the request now being written, in each wording", () => {
    for (const second of [
      "I need another corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
      "now make a separate CA for Remy Calder for his cash drawer being short $20 on 11/3",
      "create a corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
    ]) {
      expect(startsFormRequest(second), second).toBe(true);
      expect(currentFormRequestTurns([FIRST, "no payroll deduct", second, "it was a verbal"])).toEqual([second, "it was a verbal"]);
    }
  });

  it("follow-ups ask for no form and stay with their request", () => {
    expect(currentFormRequestTurns([FIRST, "no payroll deduct", "it was a verbal"])).toEqual([FIRST, "no payroll deduct", "it was a verbal"]);
  });

  it("no turn asks for a form: every turn", () => {
    expect(currentFormRequestTurns(["he was late", "no payroll deduct"])).toEqual(["he was late", "no payroll deduct"]);
  });

  it("over a window's joined text", () => {
    const second = "I need another corrective action for Remy Calder, his cash drawer was short $20 on 11/3";
    expect(currentFormRequestText([FIRST, second].join(JOIN))).toBe(second);
  });

  /*
   * QA's Sunny round-3 gate (7 Nov 2026; ported from the sibling app): with the flag on, ordinary single-request cards
   * lost their Policy line — the request was cut at the last turn naming a form. One request is the whole text,
   * wherever its account is.
   */
  describe("one request is the whole text (the round-3 gate)", () => {
    it("the account before the request", () => {
      const turns = ["she was rude to a guest at the register on 11/2 and raised her voice at her", "make a CA for Remy Calder"];
      expect(currentFormRequestTurns(turns)).toEqual(turns);
    });

    it("a closing \"create corrective action\" after the account (the sibling's SX5 chat, in this app's words)", () => {
      const turns = [
        "do verbal for team member remy calder at west dodge. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 remy was not scheduled to work and came into the store to show the team a new puppy. remy was in the store 45 min",
        "jba manual 11-1-25",
        "cite pets in workplace",
        "cite animals in the workplace policy",
        "store location is west dodge. create corrective action",
      ];
      expect(currentFormRequestTurns(turns)).toEqual(turns);
    });

    it("a window's state line naming the form, and \"ok create the CA now\"", () => {
      const text = ["The form is the Corrective Action Form.", FIRST, "ok create the CA now"].join(JOIN);
      expect(currentFormRequestText(text)).toBe(text);
    });

    it("startsNewRequest: only a later request with its own incident", () => {
      expect(startsNewRequest([], FIRST)).toBe(false);
      expect(startsNewRequest(["she was rude to a guest on 11/2"], "make a CA for Remy Calder")).toBe(false);
      expect(startsNewRequest([FIRST, "no payroll deduct"], "create a corrective action for Remy Calder, his cash drawer was short $20 on 11/3")).toBe(true);
    });
  });

  /*
   * The sibling app's round-4 gate (8 Nov 2026, sf-s21 / sf-s22): a pasted document naming a form below its first line,
   * "It needs to be a CA, not a coaching form", and the intent read's appended state lines are no request of their own.
   */
  describe("one request, whatever is pasted into it (the round-4 gate)", () => {
    const first = "create a ca for remy calder - verbal\n146 sales\nbelow on add-on sales  but i need it in the format of the other ca";
    it("a pasted document naming a form after its first line", () => {
      const turns = [first, "Use this to make it: Please make the following edits and resubmit:\n\n1. **Kit Coaching Document:** This was signed on 10/16/2026."];
      expect(currentFormRequestTurns(turns)).toEqual(turns);
    });
    it("choosing the form, with the state lines the intent read appends", () => {
      const turns = [first, "The employee is Remy Calder. Job title: Team Member.\nIt needs to be a CA, not a coaching form\ncorrective action form\nWarning level: verbal."];
      expect(currentFormRequestTurns(turns)).toEqual(turns);
    });
    it("a later request with its own incident still starts its own", () => {
      const second = "I need another corrective action for Remy Calder, his cash drawer was short $20 on 11/3";
      expect(currentFormRequestTurns([first, second])).toEqual([second]);
    });
  });
});
