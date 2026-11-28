import { describe, expect, it } from "vitest";

import {
  carriesGeneralAdviceLabel,
  generalAdviceLabel,
  generalAdviceRuleLine,
  generalAdviceVerdict,
  noMatchNote,
  restrictedTopic,
  settledGeneralAdvice,
  withGeneralAdviceLabel,
  withoutGeneralAdvice,
  type GeneralAdviceTurn,
} from "./general-advice";

/**
 * GENERAL_ADVICE (the owner, 28 Nov 2026): "Should the AI give clearly labelled general advice when company documents
 * don't cover something? Never for policy, pay or legal." — "yes". The brand below is an invented one: the mechanism
 * reads the app's own.
 */
const BRAND = "Quartz Cafe";
const LABEL = generalAdviceLabel(BRAND);

const ADVICE = [
  "1. Keep it to ten minutes, standing.",
  "2. Start with one win from yesterday.",
  "3. Give today's one focus and who owns it.",
  "4. End on time.",
].join("\n");

const turn = (over: Partial<GeneralAdviceTurn>): GeneralAdviceTurn => ({
  reply: ADVICE,
  words: "how do I run a good team huddle?",
  brand: BRAND,
  formTurn: false,
  sourceTitles: [],
  searchedOnly: true,
  ...over,
});

describe("restrictedTopic: the topics general advice never touches", () => {
  it.each([
    ["how do I run a good team huddle?"],
    ["tips for giving feedback to a new hire"],
    ["how can I keep my team motivated during a slow week"],
    ["how do I get my team to pay attention in the morning meeting"],
    ["what are good ground rules for a team meeting"],
  ])("a general management question is not restricted: %s", (words) => {
    expect(restrictedTopic(words, BRAND)).toBeNull();
  });

  it.each([
    ["how much should I pay a new team member?", "pay"],
    ["can I give her a raise", "pay"],
    ["when do paychecks come out", "pay"],
    ["what are the health insurance benefits", "benefits"],
    ["how much PTO does a shift lead get", "benefits"],
    ["how many breaks does a 6 hour shift get", "scheduling"],
    ["what are the rules for the schedule", "scheduling"],
    ["can I fire someone for being late twice?", "legal"],
    ["is it legal to cut someone's hours after they complain", "legal"],
    ["an employee says her coworker is harassing her, what do I do", "legal"],
    ["do I have to pay overtime on a holiday", "legal"],
    ["she is pregnant and wants lighter duties", "legal"],
    ["what warning level is a second no-call no-show", "discipline"],
    ["how many write ups before termination", "legal"],
    ["what's the policy on cell phones", "policy"],
    ["what does Quartz Cafe do for employee birthdays", "policy"],
  ])("%s → %s", (words, topic) => {
    expect(restrictedTopic(words, BRAND)).toBe(topic);
  });
});

describe("the rule and the no-match note", () => {
  it("the rule carries the label exactly and names every restricted topic", () => {
    const rule = generalAdviceRuleLine(BRAND, null);
    expect(rule).toContain(`"${LABEL}"`);
    for (const word of ["policy", "pay", "wages", "benefits", "scheduling rules", "Corrective Action", "legal", "HR or their manager"]) expect(rule).toContain(word);
    expect(rule).toMatch(/never goes in an answer that cites/);
    expect(rule).toMatch(/never goes on a form card/);
  });

  it("a restricted question's rule and note say no general advice and point to HR", () => {
    expect(generalAdviceRuleLine(BRAND, "pay")).toMatch(/This question is about pay and wages: no general advice on it\./);
    const note = noMatchNote(BRAND, "legal");
    expect(note).toMatch(/HR or their manager/);
    expect(note).toMatch(/never give general advice/i);
    expect(note).not.toContain(LABEL);
  });

  it("a general question's note allows labelled advice", () => {
    expect(noMatchNote(BRAND, null)).toContain(`"${LABEL}"`);
  });
});

describe("generalAdviceVerdict", () => {
  const labelled = `Nothing in our documents covers huddles.\n\n${LABEL}\n${ADVICE}`;

  it("labelled general advice on a general question is kept", () => {
    expect(generalAdviceVerdict(turn({ reply: labelled }))).toEqual({ kind: "ok" });
    expect(carriesGeneralAdviceLabel(labelled)).toBe(true);
  });

  it("general advice on a searched turn without the label gets it", () => {
    const verdict = generalAdviceVerdict(turn({}));
    expect(verdict).toEqual({ kind: "label_missing" });
    expect(settledGeneralAdvice(ADVICE, verdict, BRAND).startsWith(LABEL)).toBe(true);
  });

  it("the label goes after an opening not-in-the-documents paragraph", () => {
    const reply = `I couldn't find anything on huddles in the documents.\n\n${ADVICE}`;
    expect(withGeneralAdviceLabel(reply, BRAND)).toBe(`I couldn't find anything on huddles in the documents.\n\n${LABEL}\n${ADVICE}`);
  });

  it("a plain not-found reply is left as it is (today's answer)", () => {
    expect(generalAdviceVerdict(turn({ reply: "I couldn't find anything on huddles in the knowledge base." }))).toEqual({ kind: "ok" });
  });

  it("a labelled answer to a pay question is restricted, and settles to not-in-the-documents with HR", () => {
    const words = "how much should I pay a new team member?";
    const reply = `That isn't in the ${BRAND} documents.\n\n${LABEL}\n- Most shops start new staff a little above minimum.`;
    const verdict = generalAdviceVerdict(turn({ words, reply }));
    expect(verdict).toEqual({ kind: "restricted", topic: "pay" });
    const settled = settledGeneralAdvice(reply, verdict, BRAND);
    expect(settled).not.toContain(LABEL);
    expect(settled).not.toMatch(/minimum/);
    expect(settled).toMatch(/HR or your manager/);
  });

  it("a legal question answered from memory (uncited advice) is restricted, and replaced", () => {
    const words = "can I fire someone for being late twice?";
    const reply = "1. Check your state's at-will rules.\n2. Document both lateness dates.\n3. You can usually let them go.";
    const verdict = generalAdviceVerdict(turn({ words, reply }));
    expect(verdict).toEqual({ kind: "restricted", topic: "legal" });
    expect(settledGeneralAdvice(reply, verdict, BRAND)).toBe(`I can't find that in the ${BRAND} documents, so I won't guess. For questions about legal and HR-legal matters, please check with HR or your manager.`);
  });

  it("a restricted not-found answer that points to HR is kept", () => {
    const reply = "That isn't in the company documents I can search. Please check with HR or your manager about overtime on holidays.";
    expect(generalAdviceVerdict(turn({ words: "do I have to pay overtime on a holiday", reply }))).toEqual({ kind: "ok" });
  });

  it("a cited policy answer is never touched, and a label in it is mixed and cut", () => {
    const cited = "Arriving late is covered by the Attendance policy [S1].";
    expect(generalAdviceVerdict(turn({ words: "what's the policy on lateness", reply: cited }))).toEqual({ kind: "ok" });
    const mixed = `${cited}\n\n${LABEL}\n- Talk to them privately.`;
    const verdict = generalAdviceVerdict(turn({ words: "how do I talk to someone about being late", reply: mixed }));
    expect(verdict).toEqual({ kind: "mixed" });
    expect(settledGeneralAdvice(mixed, verdict, BRAND)).toBe(cited);
  });

  it("an answer naming a returned document cites it", () => {
    const reply = "The Opening Checklist SOP says to start with the lights.\n\n" + `${LABEL}\n- Be early.`;
    expect(generalAdviceVerdict(turn({ words: "how do I open faster", reply, sourceTitles: ["Opening Checklist SOP"] }))).toEqual({ kind: "mixed" });
  });

  it("an answer with source cards cites, even with its markers taken out", () => {
    expect(generalAdviceVerdict(turn({ words: "how do I open faster", reply: `Start with the lights.\n\n${LABEL}\n- Be early.`, cited: true }))).toEqual({ kind: "mixed" });
  });

  it("a form turn never carries the label", () => {
    const reply = `Here's the Coaching Form for Remy.\n\n${LABEL}\n- Praise in public.`;
    const verdict = generalAdviceVerdict(turn({ reply, formTurn: true, words: "coaching form for remy about huddles" }));
    expect(verdict).toEqual({ kind: "form" });
    expect(settledGeneralAdvice(reply, verdict, BRAND)).toBe("Here's the Coaching Form for Remy.");
  });

  it("a form turn, a turn with other data, or a drafting ask is never labelled by code", () => {
    expect(generalAdviceVerdict(turn({ formTurn: true }))).toEqual({ kind: "ok" });
    expect(generalAdviceVerdict(turn({ searchedOnly: false }))).toEqual({ kind: "ok" });
    expect(generalAdviceVerdict(turn({ drafting: true }))).toEqual({ kind: "ok" });
  });

  it("a label with nothing before it in a cited answer: only the label goes", () => {
    expect(withoutGeneralAdvice(`${LABEL}\nLateness is Attendance [S1].`)).toBe("Lateness is Attendance [S1].");
  });
});
