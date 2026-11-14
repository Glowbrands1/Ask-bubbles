import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/chat-trace-store", () => ({ updateChatTrace: vi.fn() }));

import type { AskResponse } from "@/lib/ai/types";

import { CARD_CHECK_MAX_CALLS, accountFromWords, addedFacts, issueProblem, personProblem, withCardCheckedAgainstWords, type CardCheckModel } from "./card-checked-against-words";
import type { RosterEmployee } from "./employee-match";

const ROSTER: RosterEmployee[] = [
  { id: "e-1", firstName: "Marnie", lastName: "Holloway", locationIds: ["loc-67"], positionName: "Team Member" },
  { id: "e-2", firstName: "Wren", lastName: "Tallis", locationIds: ["loc-67"], positionName: "Store Manager" },
];

function card(issue: string | null, employeeName: string | null = "Marnie Holloway"): AskResponse {
  return {
    content: `I'll draft a **Corrective Action Form** for **${employeeName}** from what you've described.\n\n**Issue:** ${issue ?? ""} · **Store:** Bellevue, NE, as you said — tell me if that should change`,
    citations: [],
    coverage: "not_applicable",
    formProposal: { employeeName, issue, status: "ready" } as never,
  };
}

const NO_MODEL: CardCheckModel = async () => ({ fallback: "error" });

afterEach(() => vi.unstubAllEnvs());

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: the code's checks", () => {
  const input = { turns: ["CA for Marnie Holloway, do not terminate yet, she was late"], roster: ROSTER };

  it("names what is wrong with an Issue: a hedge, a level, a title, a name", () => {
    expect(issueProblem("do not terminate yet", "Marnie Holloway", input)).toBe("issue_hedge");
    expect(issueProblem("verbal warning", "Marnie Holloway", input)).toBe("issue_title");
    expect(issueProblem("Team Member", "Marnie Holloway", input)).toBe("issue_title");
    expect(issueProblem("Marnie Holloway", "Marnie Holloway", input)).toBe("issue_name");
    expect(issueProblem("she was late", "Marnie Holloway", input)).toBeNull();
  });

  it("a person who is a job title is a problem; a name is not", () => {
    expect(personProblem("Team Member", input)).toBe("person_title");
    expect(personProblem("Marnie Holloway", input)).toBeNull();
  });

  it("the account from the manager's own clauses, without the hedge", () => {
    expect(accountFromWords("Marnie Holloway", input)).toBe("she was late");
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: the card", () => {
  const input = { turns: ["CA for Marnie Holloway, do not terminate yet, she was late"], roster: ROSTER };

  it("off: the card as built", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "false");
    const built = card("do not terminate yet");
    expect(await withCardCheckedAgainstWords(built, input, NO_MODEL)).toBe(built);
  });

  it("on: QA's 17o wording — the hedge is replaced by the account, from her words, with no model call", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const model = vi.fn(NO_MODEL);
    const out = await withCardCheckedAgainstWords(card("do not terminate yet"), input, model);
    expect(out.formProposal?.issue).toBe("she was late");
    expect(out.content).toContain("**Issue:** she was late ·");
    expect(model).not.toHaveBeenCalled();
  });

  it("on: nothing in her words repairs it and the model has no quote — the Issue is blank and the card asks what happened (never a guess)", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const only = { turns: ["CA for Marnie Holloway, do not terminate yet"], roster: ROSTER };
    const invents: CardCheckModel = async () => ({ ok: true, output: { issue: { value: "she was rude to a guest", quote: "she was rude to a guest" } } });
    const model = vi.fn(invents);
    const out = await withCardCheckedAgainstWords(card("do not terminate yet"), only, model);
    expect(out.formProposal?.issue).toBeNull();
    expect(out.content).not.toMatch(/\*\*Issue:\*\*/);
    expect(out.content).toMatch(/What happened\?/);
    expect(model).toHaveBeenCalledTimes(CARD_CHECK_MAX_CALLS);
  });

  it("on: a model correction that quotes her words stands", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const turns = { turns: ["write up Marnie Holloway", "verbal warning. she left the register unlocked overnight"], roster: ROSTER };
    const model: CardCheckModel = async () => ({ ok: true, output: { issue: { value: "left the register unlocked overnight", quote: "she left the register unlocked overnight" } } });
    const out = await withCardCheckedAgainstWords(card("verbal warning"), turns, model);
    // Changed on purpose (Gate-Bubbles-5, 13 Nov 2026): the code now reads the account from the turn after the naming
    // turn, so it repairs this card itself, in her words, before any model call.
    expect(out.formProposal?.issue).toBe("she left the register unlocked overnight");
  });

  it("on: a person who is a job title is taken off the card, and it asks who it is for", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const out = await withCardCheckedAgainstWords(card("she was late", "Team Member"), input, NO_MODEL);
    expect(out.formProposal?.employeeName).toBeNull();
    expect(out.formProposal?.status).toBe("needs_employee");
    expect(out.content).toMatch(/Who is this card for\?/);
  });

  it("on: a card that is already right is left exactly as built", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const built = card("she was late");
    const model = vi.fn(NO_MODEL);
    const out = await withCardCheckedAgainstWords(built, input, model);
    expect(out).toEqual(built);
    expect(model).not.toHaveBeenCalled();
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: a fact added on the open card (QA's 17r-c live test)", () => {
  const live = { turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", "she also didn't call to say she'd be late"], roster: ROSTER };

  it("the added detail is a fact the Issue does not hold, in her words without \"also\"", () => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", live)).toEqual(["she didn't call to say she'd be late"]);
  });

  it("guards: an answer to the card's question, a question, or a fact already on the card is never added", () => {
    const answer = { turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", "verbal warning"], roster: ROSTER };
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", answer)).toEqual([]);
    const asked = { turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", "she also left early, should I add that?"], roster: ROSTER };
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", asked)).toEqual([]);
    const again = { turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", "she was late on 11/3/26"], roster: ROSTER };
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", again)).toEqual([]);
  });

  it("on: the card's What happened keeps both facts, and the reply names the change", async () => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const out = await withCardCheckedAgainstWords(card("she was late on 11/3/26"), live, NO_MODEL);
    expect(out.formProposal?.issue).toBe("she was late on 11/3/26; she didn't call to say she'd be late");
    expect(out.content).toMatch(/\*\*Added to What happened:\*\* she didn't call to say she'd be late/);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: added details stick AND nothing wrong joins (gates, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["she was at the register on her phone for 20 minutes", "she was in the back room on her phone", "she yelled at the manager in front of customers", "she gave the keys to a non key holder", "she told the lead she might not come in and then did not come in", "she was at the front desk on her phone the whole shift", "she was a no-show on Saturday", "she ignored the posted warning about the wet floor", "she said maybe and walked out of the store", "she left the store unlocked", "she is always late on weekends", "she was rude to a customer", "Marnie left her shift early without telling anyone"])("must join: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said)).length).toBe(1);
  });
  it.each(["she was coached on 9/20 for the same thing","she was written up on 10/2","she was given a verbal warning last week","she was coached on this on 10/20","she was written up last month","she was given a final warning on 10/1","Marnie had a verbal warning on 10/1","she already had a CA on 10/14","she signed the jba policy manual on 10-15-26","Marnie signed the jba policy manual on 10-15-26","he already had a CA on 10/14 for being late","she had a verbal warning on 10/1","she gets a verbal warning", "Marnie gets a verbal warning", "she's a key holder", "she is a key holder", "she maybe forgot", "she is a TITLE", "she's our closing lead", "she might have forgotten", "she works at West Dodge", "she is at Omaha, NE (West Dodge Rd)"])("must stay out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said.replace("TITLE", ROSTER[0]!.positionName!)))).toEqual([]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: history words inside a current fact (Gate-Sunny-2, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it("\"signed\" is history only when what she signed is a policy, manual or form: \"she signed out of the register early and left\" joins", () => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after("she signed out of the register early and left"))).toEqual(["she signed out of the register early and left"]);
  });
  it("\"she had a CA last week and was late again today\": only the current clause joins", () => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after("she had a CA last week and was late again today"))).toEqual(["she was late again today"]);
  });
  it("\"she had an attitude with a customer\" still joins", () => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after("she had an attitude with a customer"))).toEqual(["she had an attitude with a customer"]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: Gate-Bubbles-5's history list (13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["she received a written warning last month", "she was given a coaching on 10/2", "she got a write-up in September", "she was coached on 9/20 for the same thing"])("stays out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([]);
  });
  it.each(["she had a customer complaint about her attitude that same day", "she was given the closing checklist and skipped half of it"])("joins: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([said]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: every and/but part through the full filter (QA, 13 Nov 2026)", () => {
  // A first fact the parts do not repeat, so only the split is tested.
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she left the register open on 11/3/26", said], roster: ROSTER });
  it.each([["she yelled at a customer and she gets a verbal warning", "she yelled at a customer"], ["she left the store unlocked and she maybe forgot", "she left the store unlocked"], ["she was late and she's a key holder", "she was late"], ["she left early but she works at West Dodge", "she left early"]])("%s → only %s joins", (said, fact) => {
    expect(addedFacts("she left the register open on 11/3/26", "Marnie Holloway", after(said))).toEqual([fact]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: Gate-Bubbles-5's must-split list (13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each([["she yelled at a customer and gets a verbal warning", "she yelled at a customer"], ["she left the store dirty and might have forgotten", "she left the store dirty"], ["she yelled at a customer and she is a key holder", "she yelled at a customer"], ["she left the store dirty, she is a TITLE", "she left the store dirty"], ["she left the store dirty and she had a verbal warning on 10/1", "she left the store dirty"], ["she yelled at a customer and then she walked out", "she yelled at a customer and then she walked out"]])("%s → %s", (said, fact) => {
    const title = ROSTER[0]!.positionName!;
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said.replace("TITLE", title)))).toEqual([fact]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: a leading time or place phrase (QA, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["on Saturday, she left the store unlocked", "yesterday she left early", "at close she skipped the deposit", "at 9pm she clocked out early", "around 3:30 she left the register open", "then she walked out", "after that she went home without telling anyone", "last night she left early"])("joins, phrase kept: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([said]);
  });
  it("a time lead does not let a non-fact in: \"yesterday she gets a verbal warning\" stays out", () => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after("yesterday she gets a verbal warning"))).toEqual([]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: the Issue repair never takes history (Gate-Bubbles-5 / Gate-Sunny-2, 13 Nov 2026)", () => {
  const read = (turn: string) => accountFromWords("Rory Vance", { turns: [turn], roster: ROSTER });
  it.each([
    ["ca for Rory Vance, coached her 10-16, she was late again 10-20", "she was late again 10-20"],
    ["ca for Rory Vance, signed the manual 10/1, late on 10/20", "late on 10/20"],
    ["ca for Rory Vance, verbal on 10/1, she left the drawer open", "she left the drawer open"],
  ])("%s → %s", (turn, account) => {
    expect(read(turn)).toBe(account);
  });
  it("\"ca for Rory Vance, coached her 10-16, written warning on 10-20\": no repair (history and a level), never \"coached her 10-16\"", () => {
    expect(read("ca for Rory Vance, coached her 10-16, written warning on 10-20")).toBeNull();
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: a first account is never \"Added\" (the sibling app's gate, 13 Nov 2026)", () => {
  it.each([
    [["make a written CA for Marnie Holloway", "she was late on 11/3/26 and didn't call"]],
    [["corrective action", "Marnie Holloway", "she was late on 11/3/26 and didn't call"]],
    [["Can you make a written CA for Marnie Holloway on performance", "she was late on 11/3/26 and didn't call"]],
  ])("%j: the card built from the account adds nothing to it", async (turns) => {
    vi.stubEnv("CARD_CHECKED_AGAINST_WORDS_ENABLED", "true");
    const out = await withCardCheckedAgainstWords(card("she was late on 11/3/26 and didn't call"), { turns, roster: ROSTER }, NO_MODEL);
    expect(out.content).not.toMatch(/Added to What happened/);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: a name answer or a new request is never an added detail (gates, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["Marnie Holloway, General Manager", "marnie holloway, general manager", "Marnie Holloway - Team Member", "Marnie Holloway, TITLE", "Marnie Holloway", "marnie holloway needs a written warning for cash handling", "she needs a written warning for cash handling", "Marnie needs a coaching form for the closing checklist", "she also needs a CA for being late on 11/4"])("stays out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said.replace("TITLE", ROSTER[0]!.positionName!)))).toEqual([]);
  });
  it.each(["she needed a ride and left early", "Marnie left her shift early without telling anyone", "she gave the keys to a non key holder"])("still joins: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([said]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: Gate-Bubbles-5's name-answer and request lines (13 Nov 2026)", () => {
  const tessa = (said: string) => ({ turns: ["create a CA for Tessa Ormond, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["Tessa Ormond, General Manager", "tessa ormond, general manager", "Tessa Ormond - Team Member"])("a name answer stays out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Tessa Ormond", tessa(said))).toEqual([]);
  });
  it("after a two-card turn, \"jordan testperson needs a written warning for cash handling\" is a request, never a detail", () => {
    const turns = ["coaching form for Avery Testperson and a CA for Jordan Testperson", "jordan testperson needs a written warning for cash handling"];
    expect(addedFacts("cash handling", "Jordan Testperson", { turns, roster: ROSTER })).toEqual([]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: a payroll or deduction amount is not what she did (Gate-Sunny-2, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["she owes $25 for the late opening", "deduct $40 from her check", "she'll pay back $20", "payroll deduct yes, $15", "she owes 25 dollars"])("stays out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([]);
  });
  it.each(["she took $20 from the drawer", "she was short $20", "she gave a customer a $10 discount without asking"])("still joins: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([said]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: payment phrasings are payroll too (Gate-Sunny-2, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each([
    "she has to pay $15 for the broken bulb",
    "she needs to pay $15 for the broken bulb",
    "she must pay back $15",
    "she will be charged $15",
    "she is being charged $15 for it",
    "we're charging her $15",
    "she said take it out of her check, $15",
  ])("stays out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([]);
  });
  it.each(["she broke a $15 bulb", "she has to pay attention to the schedule and skipped her break"])("still joins: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([said]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: a place one letter off is still only a place (QA, CLOSE_SPELLING_MATCH live, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["she is at West Dodg", "she is at the Omah store", "she works at West Dodg"])("with CLOSE_SPELLING_MATCH on, stays out: %s", (said) => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([]);
  });
  it("with CLOSE_SPELLING_MATCH on, an action at a place one letter off still joins", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after("she was rude to a customer at the Omah store"))).toEqual(["she was rude to a customer at the Omah store"]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: paying with no amount is payroll too (Gate-Bubbles-5, 13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["she needs to pay for the bulb", "she will be charged for the bulb", "she has to pay it back"])("stays out: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([]);
  });
  it.each(["she broke a $15 bulb", "she had to stay late to recount the drawer", "she needs to be told twice before she cleans", "she was charged by a customer for the wrong item and argued"])("still joins: %s", (said) => {
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([said]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: the gates' place-typo list (13 Nov 2026)", () => {
  const after = (said: string) => ({ turns: ["create a CA for Marnie Holloway, she was late on 11/3/26", said], roster: ROSTER });
  it.each(["she is at West Dodgr", "she is at West Doge", "she is at Bellvue", "she is at Belevue", "she is at Omaha, NE (West Dodg Rd)", "she works at Wst Dodge", "she works at Omah"])("with CLOSE_SPELLING_MATCH on, stays out: %s", (said) => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after(said))).toEqual([]);
  });
  it("with CLOSE_SPELLING_MATCH on, a typo'd thing in the store plus an action still joins", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(addedFacts("she was late on 11/3/26", "Marnie Holloway", after("she was at the regster on her phone"))).toEqual(["she was at the regster on her phone"]);
  });
});

describe("CARD_CHECKED_AGAINST_WORDS_ENABLED: an account in the turn after the naming turn (Gate-Bubbles-5, 13 Nov 2026)", () => {
  const naming = "create corrective action form for Marnie Holloway, Team Member Part Time";
  const answer = "she skipped the closing checklist on her shift last night";
  it("the naming turn holds only a title; the next turn's account repairs the Issue, and nothing asks what happened", () => {
    expect(accountFromWords("Marnie Holloway", { turns: [naming, answer], roster: ROSTER })).toBe(answer);
  });
  it("the naming turn's own account still wins over a later turn", () => {
    expect(accountFromWords("Marnie Holloway", { turns: ["create a CA for Marnie Holloway, she was late", answer], roster: ROSTER })).toBe("she was late");
  });
  it("a later turn that is no account (a level, a question) repairs nothing", () => {
    expect(accountFromWords("Marnie Holloway", { turns: [naming, "verbal warning"], roster: ROSTER })).toBeNull();
    expect(accountFromWords("Marnie Holloway", { turns: [naming, "what level should this be?"], roster: ROSTER })).toBeNull();
  });
});

