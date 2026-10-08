import { describe, expect, it, vi } from "vitest";

import { correctiveActionDocument } from "@/lib/forms/library";
import { continuationFor, isProposalSuperseded } from "@/lib/forms/proposal-continuation";
import { detectTemplateIntent } from "@/lib/forms/template-intent";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * CONVERSATIONS AS MANAGERS ACTUALLY TYPE THEM — THE FORM INTAKE UNDER STRESS
 * ============================================================================
 *
 * Built on the reference platform's 99-turn production QA pattern
 * (`form-intake-qa-2026-09-30.test.ts`): each manager turn goes through the
 * REAL `proposeFormForTurn` with the continuation the browser would compute
 * (`continuationFor`), and a turn the form path declines is recorded as an
 * advice reply. What is asserted is the card the manager would press — its
 * form, its person, its date — never plausible wording.
 *
 * Every case below was run against both this platform and the reference one
 * before the change. The ones marked FIXED failed on both: the wrong person
 * on a disciplinary form ("cash handling", "avery testperson dated"), a
 * correction before the draft dropped as advice, "don't make a form" ignored,
 * and workplace shorthand ("c/a", "final written", "phone screen", "step X
 * down") answered as advice. The rest are controls that already passed and
 * must keep passing.
 *
 * All people are synthetic.
 */

vi.mock("@/lib/forms/repository", () => ({
  listTemplateSummaries: async () => {
    throw new Error("the proposal takes the library from its caller");
  },
  getTemplateByKey: async () => {
    throw new Error("the proposal must not read the library");
  },
}));

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

function template(key: string, name: string, permission: string, extra: Record<string, unknown> = {}) {
  return {
    id: `tpl-${key}`,
    key,
    name,
    shortName: name,
    description: name,
    layoutFamily: key,
    requiredPermission: permission,
    active: true,
    displayOrder: 1,
    currentVersion: { id: `v-${key}`, status: "published", variants: [] },
    draftVersion: null,
    versionCount: 1,
    activeAsset: null,
    assetCount: 0,
    ...extra,
  };
}

const LIBRARY = [
  template("coaching", "Coaching Form", "create_coaching_form"),
  template("follow-up-coaching", "Follow-Up Coaching Form", "create_coaching_form"),
  template("policy-review", "Policy Review", "create_policy_review"),
  template("dpoa", "Corrective Action Form", "create_corrective_action", {
    currentVersion: { id: "v-dpoa", status: "published", document: correctiveActionDocument(), variants: [] },
  }),
  template("resignation-exit", "Resignation/Exit Form", "create_exit_form"),
  template("demotion", "Demotion Form", "create_employment_change_form"),
  template("position-transfer", "Position Transfer Form", "create_employment_change_form"),
  template("prescreen-phone-interview", "Prescreen / Phone Interview Form", "create_hiring_form"),
  template("tanning-consultant-interview", "Tanning Consultant Interview Form", "create_hiring_form"),
];

let counter = 0;
const id = () => `stress-${(counter += 1)}`;
const TODAY = "2026-09-30"; // a Wednesday

interface Replay {
  thread: ChatMessage[];
  last: ChatMessage;
}

async function converse(...turns: string[]): Promise<Replay> {
  const { proposeFormForTurn } = await import("./form-proposal");
  const thread: ChatMessage[] = [];
  for (const question of turns) {
    const history = [...thread];
    const user: ChatMessage = { id: id(), role: "user", content: question, createdAt: "2026-09-30T12:00:00Z" };
    thread.push(user);
    const answer = await proposeFormForTurn({
      history,
      question,
      questionMessageId: user.id,
      actor: { role: "admin" as never, scope: GLOBAL },
      continueTemplateKey: continuationFor(history)?.templateKey,
      summaries: LIBRARY as never,
      today: TODAY,
    });
    thread.push({
      id: id(),
      role: "assistant",
      content: answer?.content ?? "Here is some general guidance on handling that conversation.",
      createdAt: "2026-09-30T12:00:00Z",
      ...(answer?.formProposal ? { formProposal: answer.formProposal } : {}),
      ...(answer?.formSelection ? { formSelection: answer.formSelection } : {}),
    });
  }
  return { thread, last: thread[thread.length - 1]! };
}

function expectCard(replay: Replay, templateKey: string, employeeName: string | null) {
  const card = replay.last.formProposal;
  expect(card, replay.last.content).toBeDefined();
  expect(card!.templateKey).toBe(templateKey);
  if (employeeName === null) expect(card!.employeeName).toBeNull();
  else expect(card!.employeeName?.toLowerCase()).toBe(employeeName.toLowerCase());
}

function expectAdvice(replay: Replay) {
  expect(replay.last.formProposal, replay.last.content).toBeUndefined();
  expect(replay.last.formSelection).toBeUndefined();
}

function expectPicker(replay: Replay) {
  expect(replay.last.formProposal, replay.last.content).toBeUndefined();
  expect(replay.last.formSelection).toBeDefined();
}

/* ============================================ 1. who the form is for === */

describe("1. the person on the form is never an incident topic or a date word (FIXED)", () => {
  it("'needs a written warning for cash handling' is for Jordan, not 'cash handling'", async () => {
    expectCard(await converse("jordan testperson needs a written warning for cash handling"), "dpoa", "jordan testperson");
  });

  it.each([
    ["coaching form for avery testperson dated 10/2", "avery testperson", "2026-10-02"],
    ["coaching form for avery testperson sept 28", "avery testperson", "2026-09-28"],
    ["Coaching Form for Avery Testperson Sept 28", "avery testperson", "2026-09-28"],
  ])("%s → %s, dated %s", async (turn, person, date) => {
    const replay = await converse(turn);
    expectCard(replay, "coaching", person);
    expect(replay.last.formProposal!.formDate).toBe(date);
  });

  it.each([
    "coaching form for cash handling",
    "coaching form for register shortage",
    "coaching form for shift coverage",
  ])("'%s' names nobody, so the employee is asked for", async (turn) => {
    const replay = await converse(turn);
    expectCard(replay, "coaching", null);
  });

  it("capitalised, a topic is still a topic: 'Jordan Testperson needs a written warning for Cash Handling'", async () => {
    expectCard(await converse("Jordan Testperson needs a written warning for Cash Handling"), "dpoa", "jordan testperson");
  });

  it.each(["Coaching form for Shift Coverage", "coaching form for Register Shortage"])("'%s' names nobody", async (turn) => {
    expectCard(await converse(turn), "coaching", null);
  });

  it.each([
    ["coaching form for jamie cash", "jamie cash"],
    ["Coaching form for Jamie Cash", "jamie cash"],
    ["Coaching Form for Price Smith", "price smith"],
    ["coaching form for price smith", "price smith"],
  ])("a name that shares a word with a topic is kept whole: %s", async (turn, person) => {
    expectCard(await converse(turn), "coaching", person);
  });

  it("'May' as a first name is still a name", async () => {
    expectCard(await converse("coaching form for may smith"), "coaching", "may smith");
  });
});

describe("1b. names in any case, wrapper and position (controls)", () => {
  it.each([
    ["Coaching form for AVERY TESTPERSON", "avery testperson"],
    ['coaching form for "avery testperson"', "avery testperson"],
    ["coachng form avery testperson", "avery testperson"],
    ["can u do a coachin form for avery testperson", "avery testperson"],
    ["CA FORM FOR JORDAN TESTPERSON - NCNS 9/27", "jordan testperson"],
  ])("%s → %s", async (turn, person) => {
    const replay = await converse(turn);
    expect(replay.last.formProposal?.employeeName?.toLowerCase()).toBe(person);
  });

  it("two people named: asks which, never picks one", async () => {
    const replay = await converse("coaching form for Avery Testperson and Jordan Testperson");
    expectCard(replay, "coaching", null);
    expect(replay.last.content).toContain("Which of them");
  });

  it("a pronoun or a role is not a person: the employee is asked for", async () => {
    for (const turn of ["coaching form for her", "coaching form for my opener", "coaching form for the employee who was late"]) {
      expectCard(await converse(turn), "coaching", null);
    }
  });
});

/* ======================================= 2. corrections before the draft === */

describe("2. a correction before the draft replaces the person (FIXED)", () => {
  it.each([
    "actually make it jordan testperson",
    "no wait, not avery, jordan testperson",
    "wrong person - its jordan testperson",
    "sorry i meant jordan testperson",
    "No, not Avery Testperson. Jordan Testperson.",
  ])("coaching form for avery testperson → '%s' → Jordan", async (correction) => {
    const replay = await converse("coaching form for avery testperson", correction);
    expectCard(replay, "coaching", "jordan testperson");
    // The first card is now superseded, so it cannot file a form for Avery.
    const first = replay.thread[1]!.formProposal!;
    expect(isProposalSuperseded(replay.thread, first.proposalId)).toBe(true);
  });

  it("changing the form keeps the person: 'actually make it a CA'", async () => {
    expectCard(await converse("coaching form for avery testperson", "actually make it a CA"), "dpoa", "avery testperson");
  });

  it("repeating the same request is the same card, not two people or two forms", async () => {
    const replay = await converse("coaching form for avery testperson", "coaching form for avery testperson");
    expectCard(replay, "coaching", "avery testperson");
  });
});

/* =============================================== 3. changes of intent === */

describe("3. negation and changes of intent", () => {
  it.each([
    "actually don't make a form",
    "dont create the form",
    "never mind",
    "skip the form",
    "no need for a form",
  ])("coaching form for avery testperson → '%s' ends the intake (FIXED for the first three)", async (turn) => {
    const replay = await converse("coaching form for avery testperson", turn);
    expectAdvice(replay);
    expect(continuationFor(replay.thread)).toBeNull();
  });

  it("'I don't want a form yet' is advice, not a picker", async () => {
    expectAdvice(await converse("I don't want a form yet, how do I talk to avery testperson about lateness?"));
  });

  it("a question in the middle of an intake is answered, and the intake survives it", async () => {
    const replay = await converse(
      "coaching form for avery testperson",
      "what's the attendance policy?",
      "she was late 3 times this week",
    );
    expect(replay.thread[3]!.formProposal).toBeUndefined();
    expectCard(replay, "coaching", "avery testperson");
  });
});

/* =================================== 4. jargon, shorthand, typos, case === */

describe("4. the words managers use for each form (FIXED where marked)", () => {
  it.each([
    ["pls start a c/a for jordan testperson, no call no show yesterday", "dpoa", "jordan testperson"], // FIXED
    ["final written for jordan testperson", "dpoa", "jordan testperson"], // FIXED
    ["need a CA on jordan testperson", "dpoa", "jordan testperson"],
    ["jordan testperson needs a written warning for cash handling", "dpoa", "jordan testperson"], // FIXED
    ["phone screen for a candidate named Sam Rivera", "prescreen-phone-interview", "sam rivera"], // FIXED
    ["TC interview for Sam Rivera", "tanning-consultant-interview", "sam rivera"], // FIXED
    ["step jordan testperson down to associate", "demotion", "jordan testperson"], // FIXED
    ["demote jordan testperson from shift lead", "demotion", "jordan testperson"],
    ["transfer avery testperson to another location", "position-transfer", "avery testperson"],
    ["avery testperson quit, need exit paperwork", "resignation-exit", "avery testperson"],
    ["termination form for avery testperson", "resignation-exit", "avery testperson"],
  ])("%s → %s for %s", async (turn, key, person) => {
    expectCard(await converse(turn), key, person);
  });

  it("'interview form' names four forms, so the manager picks (FIXED)", async () => {
    expectPicker(await converse("interview form"));
  });

  it("'I need a form' never defaults to a form", async () => {
    expectPicker(await converse("I need a form"));
  });

  it.each([
    "what's the difference between a coaching form and a CA?",
    "how do i fill out an exit form?",
    "how do i fill out an interview form?",
    "what are the steps for a transfer?",
    "phone screen tips?",
    "what's the next step for avery testperson",
    "the phone interview went well, what next?",
  ])("a question about a form or a step stays a question: %s", async (turn) => {
    expectAdvice(await converse(turn));
  });

  it("intent does not depend on capitalisation", () => {
    for (const turn of ["FINAL WRITTEN FOR JORDAN TESTPERSON", "Final Written for Jordan Testperson", "final written for jordan testperson"]) {
      expect(detectTemplateIntent(turn)).toEqual({ kind: "explicit", templateKey: "dpoa" });
    }
  });
});

/* =================================== 5. multi-turn and incomplete intake === */

describe("5. an intake given across turns keeps what it already has", () => {
  it("form, then person, then incident with a date — never re-asks the person", async () => {
    const replay = await converse("coaching form", "avery testperson", "she was 20 min late on 9/28");
    expectCard(replay, "coaching", "avery testperson");
    expect(replay.last.formProposal!.formDate).toBe("2026-09-28");
    expect(replay.last.content).not.toMatch(/employee's full name/i);
  });

  it("an incomplete request asks only for what is missing", async () => {
    const replay = await converse("coaching form");
    expectCard(replay, "coaching", null);
    expect(replay.last.content).toMatch(/employee's full name/i);
  });
});

/* ========================================== 6. exit facts and negation === */

describe("6. the exit form reads rehire, last day and notice as typed", () => {
  const card = async (...turns: string[]) => (await converse(...turns)).last.content;

  it.each([
    ["exit form for jordan testperson, would not rehire", "not eligible for rehire"],
    ["exit form for jordan testperson. no rehire. gave 2 week notice", "not eligible for rehire"],
    ["exit form for jordan testperson, wouldnt rehire her", "not eligible for rehire"], // FIXED: no apostrophe
    ["exit form for jordan testperson, eligible for rehire", "Employee is eligible for rehire"],
  ])("%s → %s", async (turn, expected) => {
    expect(await card(turn)).toContain(expected);
  });

  it("uncertainty is not an answer: 'not sure about rehire yet' leaves it blank", async () => {
    expect(await card("exit form for jordan testperson, not sure about rehire yet")).not.toContain("Eligible for Rehire:**");
  });

  it("a later turn that contradicts an earlier one wins", async () => {
    const content = await card("exit form for jordan testperson, rehire: yes", "actually no, not eligible for rehire");
    expect(content).toContain("Employee is not eligible for rehire");
  });

  it.each([
    ["exit form for jordan testperson, last day was last friday", "September 25, 2026"],
    ["exit form for jordan testperson, last day yesterday", "September 29, 2026"],
    ["exit form for jordan testperson, last day yest", "September 29, 2026"], // FIXED: phone shorthand
    ["exit form for jordan testperson, last day was 2 days ago", "September 28, 2026"], // FIXED
  ])("%s → Last Day Worked %s", async (turn, date) => {
    expect(await card(turn)).toContain(`**Last Day Worked:** ${date}`);
  });

  it("a bare weekday is not a date: the last day is asked for", async () => {
    const content = await card("exit form for jordan testperson, last day was friday");
    expect(content).not.toContain("**Last Day Worked:**");
  });
});

/* ======================== 7. several requests in one message (release review) === */

describe("7. a message with more than one request never loses one", () => {
  it("two forms for two people: both are named back, neither card is guessed", async () => {
    const replay = await converse("coaching form for avery testperson and a CA for jordan testperson");
    expectAdvice(replay);
    expect(replay.last.content).toContain("**Coaching Form** for **avery testperson**");
    expect(replay.last.content).toContain("**Corrective Action Form** for **jordan testperson**");
    expect(replay.last.content).toContain("one at a time");
  });

  it("'transfer form for avery … and an exit form for jordan …' — the same", async () => {
    const replay = await converse("make a transfer form for avery testperson and an exit form for jordan testperson");
    expectAdvice(replay);
    expect(replay.last.content).toContain("**Position Transfer Form** for **avery testperson**");
    expect(replay.last.content).toContain("**Resignation/Exit Form** for **jordan testperson**");
  });

  it.each([
    ["coaching - policy review", "coaching"],
    ["coaching form for avery testperson, actually make it a policy review", "policy-review"],
    ["coaching form for avery testperson, not a CA", "coaching"],
    ["make it a CA instead of a coaching form for avery testperson", "dpoa"],
  ])("'%s' is one request (a topic, a switch or a negation), not two", async (turn, key) => {
    const replay = await converse(turn);
    expect(replay.last.formProposal?.templateKey).toBe(key);
  });

  it("a question beside a form request: the card, AND the question named back", async () => {
    const replay = await converse("coaching form for avery testperson. what is the attendance policy?");
    expectCard(replay, "coaching", "avery testperson");
    expect(replay.last.content).toContain('You also asked "what is the attendance policy?"');
  });

  it("a correction and a question in one turn: the corrected card, and the question named back", async () => {
    const replay = await converse("coaching form for avery testperson", "actually its jordan testperson. also whats the attendance policy?");
    expectCard(replay, "coaching", "jordan testperson");
    expect(replay.last.content).toContain("whats the attendance policy?");
  });

  it("'make it jordan testperson and change it to a CA' changes BOTH the person and the form", async () => {
    expectCard(
      await converse("coaching form for avery testperson", "make it jordan testperson and change it to a CA"),
      "dpoa",
      "jordan testperson",
    );
  });

  it("'make it a CA' alone keeps the person", async () => {
    expectCard(await converse("coaching form for avery testperson", "make it a CA"), "dpoa", "avery testperson");
  });

  it("two people joined by 'and', in lower case, are asked about — never the first one silently", async () => {
    for (const turn of ["coaching form for avery testperson and jordan testperson", "coaching form for avery testperson & jordan testperson"]) {
      const replay = await converse(turn);
      expectCard(replay, "coaching", null);
      expect(replay.last.content).toContain("Which of them");
    }
  });

  it("'and' followed by a pronoun or the team is not a second person", async () => {
    expectCard(await converse("coaching form for avery testperson and she was late"), "coaching", "avery testperson");
  });

  it("a polite question that IS the request gets no extra note", async () => {
    const replay = await converse("can you make a coaching form for avery testperson?");
    expectCard(replay, "coaching", "avery testperson");
    expect(replay.last.content).not.toContain("You also asked");
  });
});
