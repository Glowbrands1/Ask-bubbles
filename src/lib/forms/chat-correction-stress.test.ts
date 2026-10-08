import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseFormDocument } from "./document";
import { TEMPLATE_SEEDS } from "./library";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * CORRECTING A DRAFT THAT EXISTS — AS MANAGERS TYPE IT
 * ============================================================================
 *
 * The same harness as `chat-correction.test.ts`: the real `correctActiveForm`,
 * with the instance, its authorization and the save replaced, so every case
 * asserts EXACTLY what would be written — and that nothing else is.
 *
 * FIXED in this change, each failing before it:
 *   - "change the date to yesterday" on a Coaching Form or a transfer reached
 *     the AI revision path instead of re-dating the form;
 *   - "2 days ago", "yest", "tmrw" were not dates;
 *   - "wouldnt rehire" (no apostrophe) was not an answer;
 *   - "…→ Employee is not eligible for rehire.." printed two full stops.
 *
 * Unchanged on purpose, and pinned here: the Corrective Action Form takes only
 * its payroll answer from chat; a finalized form, another person, a new
 * request, a question or a forbidden edit is never written to.
 *
 * All people are synthetic.
 */

const state = vi.hoisted(() => ({
  templateKey: "position-transfer",
  status: "draft",
  authorized: true,
  saved: [] as { values: Record<string, string>; checked: Record<string, string[]> }[],
  employeeName: "Avery Testperson",
}));

vi.mock("./instance-scope", () => ({
  authorizeInstance: async () => {
    if (!state.authorized) throw new Error("not permitted");
    const seed = TEMPLATE_SEEDS.find((entry) => entry.key === state.templateKey)!;
    return {
      actor: { id: "user-1", role: "location_manager", verified: true, scope: null },
      loaded: {
        instance: {
          id: "form-1",
          templateKey: seed.key,
          templateName: seed.name,
          variantKey: null,
          employeeName: state.employeeName,
          status: state.status,
        },
        version: { document: parseFormDocument(seed.document), variants: [] },
        values: [],
      },
    };
  },
}));

vi.mock("./instances", () => ({
  saveInstanceValues: async (
    _id: string,
    submitted: { values: Record<string, string>; checked: Record<string, string[]> },
  ) => {
    state.saved.push(submitted);
    return { rejected: [] };
  },
}));

const { correctActiveForm } = await import("./chat-correction");

const TODAY = "2026-09-30"; // a Wednesday

const correct = (question: string) =>
  correctActiveForm({
    request: new Request("http://localhost/api/chat"),
    instanceId: "22222222-2222-2222-2222-222222222222",
    question,
    today: TODAY,
  });

beforeEach(() => {
  state.templateKey = "position-transfer";
  state.status = "draft";
  state.authorized = true;
  state.saved = [];
  state.employeeName = "Avery Testperson";
});

describe("the form's date, said the way managers say it (FIXED)", () => {
  it.each([
    ["coaching", "change the date to yesterday", "2026-09-29"],
    ["coaching", "change the date to tmrw", "2026-10-01"],
    ["coaching", "Change The Date To Yesterday", "2026-09-29"],
    ["coaching", "change the date to last friday", "2026-09-25"],
    ["position-transfer", "change the date to yesterday", "2026-09-29"],
    ["position-transfer", "change the date to 2 days ago", "2026-09-28"],
    ["demotion", "the date should be 9/27", "2026-09-27"],
    ["resignation-exit", "change the date to yest", "2026-09-29"],
  ])("%s: '%s' → form_date %s, and nothing else", async (key, question, iso) => {
    state.templateKey = key;
    const response = await correct(question);
    expect(state.saved).toEqual([{ values: { form_date: iso }, checked: {} }]);
    expect(response!.formUpdate).toEqual({ instanceId: "22222222-2222-2222-2222-222222222222", updated: ["form_date"] });
  });

  it("a form with no date line (Follow-Up Coaching) is never given one", async () => {
    state.templateKey = "follow-up-coaching";
    expect(await correct("change the date to yesterday")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("a bare weekday names no particular day, so nothing is written", async () => {
    state.templateKey = "coaching";
    expect(await correct("change the date to friday")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("a date too far back to be 'N days ago' is not guessed", async () => {
    state.templateKey = "coaching";
    expect(await correct("change the date to 90 days ago")).toBeNull();
    expect(state.saved).toEqual([]);
  });
});

describe("the employee's name on a draft that exists", () => {
  it("'change the name to …' renames a Coaching draft, and only the name", async () => {
    state.templateKey = "coaching";
    await correct("change the name to Avery Testperson-Lee");
    expect(state.saved).toEqual([{ values: { employee_name: "Avery Testperson-Lee" }, checked: {} }]);
  });

  it("'actually her name is …' is the same correction said as a statement", async () => {
    state.templateKey = "coaching";
    await correct("actually her name is Avery Testperson-Lee");
    expect(state.saved).toEqual([{ values: { employee_name: "Avery Testperson-Lee" }, checked: {} }]);
  });
});

describe("the Corrective Action Form keeps the reference platform's rule: only its payroll answer", () => {
  it.each(["change the date to yesterday", "change the name to Jordan Testperson"])("leaves '%s' alone", async (question) => {
    state.templateKey = "dpoa";
    expect(await correct(question)).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("still takes the payroll answer", async () => {
    state.templateKey = "dpoa";
    await correct("payroll deduct is not applicable");
    expect(state.saved).toEqual([{ values: {}, checked: { payroll_deduct: ["no"] } }]);
  });
});

describe("rehire, typed without apostrophes and contradicted later (FIXED)", () => {
  beforeEach(() => {
    state.templateKey = "resignation-exit";
  });

  it.each([
    ["wouldnt rehire", "no"],
    ["she isnt eligible for rehire", "no"],
    ["dont rehire", "no"],
    ["no rehire", "no"],
    ["shes not eligible for rehire", "no"],
    ["actually she IS eligible for rehire", "yes"],
  ])("'%s' → eligible_for_rehire %s", async (question, answer) => {
    await correct(question);
    expect(state.saved).toEqual([{ values: {}, checked: { eligible_for_rehire: [answer] } }]);
  });

  it("the summary ends with one full stop", async () => {
    const response = await correct("wouldnt rehire");
    expect(response!.content).toBe(
      "Updated the **Resignation/Exit Form** for **Avery Testperson**: Eligible for Rehire → Employee is not eligible for rehire.",
    );
  });

  it("last day, said with phone shorthand", async () => {
    await correct("last day was actually yest");
    expect(state.saved).toEqual([{ values: { last_day_worked: "2026-09-29" }, checked: {} }]);
  });
});

describe("what is never written", () => {
  it("a finalized form", async () => {
    state.templateKey = "coaching";
    state.status = "finalized";
    const response = await correct("change the date to yesterday");
    expect(state.saved).toEqual([]);
    expect(response!.content).toContain("finalized");
  });

  it("a form the manager may not edit", async () => {
    state.templateKey = "coaching";
    state.authorized = false;
    expect(await correct("change the date to yesterday")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("another person's record: 'change the date to yesterday for jordan testperson'", async () => {
    state.templateKey = "coaching";
    expect(await correct("change the date to yesterday for Jordan Testperson")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it.each([
    "create a coaching form for jordan testperson",
    "I need a new coaching form, date it yesterday",
    "what date is on this form?",
  ])("a new request or a question: '%s'", async (question) => {
    state.templateKey = "coaching";
    expect(await correct(question)).toBeNull();
    expect(state.saved).toEqual([]);
  });
});

describe("nothing in the message is silently dropped (release review)", () => {
  const NOTE = "I haven't done this part of your message yet";

  it("saves the date, and names the part it did not do", async () => {
    state.templateKey = "coaching";
    const response = await correct("change the date to yesterday and shorten the summary");
    expect(state.saved).toEqual([{ values: { form_date: "2026-09-29" }, checked: {} }]);
    expect(response!.content).toContain(NOTE);
    expect(response!.content).toContain('- "shorten the summary"');
  });

  it("'…and the name to Jordan Testperson' saves the date and flags the name, never renaming to someone else", async () => {
    state.templateKey = "coaching";
    const response = await correct("change the date to yesterday and the name to Jordan Testperson");
    expect(state.saved).toEqual([{ values: { form_date: "2026-09-29" }, checked: {} }]);
    expect(response!.content).toContain('- "the name to Jordan Testperson"');
  });

  it("a question after a correction no longer stops the correction, and is named back", async () => {
    state.templateKey = "position-transfer";
    const response = await correct("new location salon 24. also what is the transfer policy?");
    expect(state.saved).toEqual([{ values: { new_location: "Salon 24" }, checked: {} }]);
    expect(response!.content).toContain('- "what is the transfer policy?"');
  });

  it("a correction the form's reader could not read whole is applied clause by clause, and the rest named", async () => {
    state.templateKey = "position-transfer";
    const response = await correct("change her new location to salon 24 and rewrite the reason to mention her schedule");
    expect(state.saved).toEqual([{ values: { new_location: "Salon 24" }, checked: {} }]);
    expect(response!.content).toContain('- "rewrite the reason to mention her schedule"');
  });

  it("two corrections the reader takes together are both saved, with no note", async () => {
    state.templateKey = "position-transfer";
    const response = await correct("change her new location to salon 24 and her new pay rate to $15");
    expect(state.saved).toEqual([{ values: { new_location: "Salon 24", new_pay_rate: "$15.00" }, checked: {} }]);
    expect(response!.content).not.toContain(NOTE);
  });

  it.each([
    ["dpoa", "payroll deduct is not applicable and add that she was late twice", "add that she was late twice"],
    ["resignation-exit", "last day was yesterday and change the date to today", "change the date to today"],
  ])("%s: '%s' names '%s'", async (key, question, leftover) => {
    state.templateKey = key;
    const response = await correct(question);
    expect(state.saved).toHaveLength(1);
    expect(response!.content).toContain(`- "${leftover}"`);
  });

  it("a request that is only a revision still goes to the revision path untouched", async () => {
    state.templateKey = "position-transfer";
    expect(await correct("rewrite the reason to say she starts at salon 24")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("a plain correction gets no note", async () => {
    state.templateKey = "coaching";
    const response = await correct("change the date to yesterday, thanks");
    expect(response!.content).not.toContain(NOTE);
  });
});

describe("the exit form: one clause's 'not' never reaches the next (release review, both platforms)", () => {
  it("'shes not eligible for rehire and add that she returned her key' records the key as RETURNED", async () => {
    state.templateKey = "resignation-exit";
    await correct("shes not eligible for rehire and add that she returned her key");
    expect(state.saved).toEqual([
      { values: {}, checked: { salon_key_returned: ["yes"], eligible_for_rehire: ["no"] } },
    ]);
  });

  it("a negation that covers both halves still does: 'didn't return the key or the apron'", async () => {
    state.templateKey = "resignation-exit";
    await correct("she didn't return the key or the apron");
    expect(state.saved[0]!.checked.salon_key_returned).toEqual(["no"]);
  });
});

describe("a statement that opens like a question is still a statement", () => {
  it("'she quit. will be dropped to min wage' — the second sentence is read, not set aside", async () => {
    state.templateKey = "resignation-exit";
    const response = await correct("she is not eligible for rehire. will be dropped to min wage");
    expect(state.saved[0]!.checked).toMatchObject({ eligible_for_rehire: ["no"], dropped_to_minimum_wage: ["yes"] });
    expect(response!.content).not.toContain("I haven't done this part");
  });
});
