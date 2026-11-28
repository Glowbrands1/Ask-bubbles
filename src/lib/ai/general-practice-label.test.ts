import { describe, expect, it } from "vitest";

import { generalAdviceLabel, opensGeneralPractice, settledGeneralPractice, type GeneralPracticeTurn } from "./general-advice";

/**
 * THE OLDER CHAT'S UNLABELLED "AS A GENERAL APPROACH…" LINES (GENERAL_ADVICE_ENABLED; port from the sibling app). The
 * owner, 28 Nov 2026, said "ok good" to: the older chat's unlabelled "as a general approach…" lines get the same rule as
 * the new labelled general advice — the exact label, never inside an answer that cites a policy, never on pay,
 * discipline or legal topics.
 *
 * PREP_REPLY is this app's own production reply (conv_mvmvo5wf2p0o2b7, `not-a-name-oct24.test.ts`): uncited coaching
 * prep ending "As a general approach, hold it privately…" with no label. The cited answer below is invented test text.
 */
const BRAND = "Buff City Soap";
const LABEL = generalAdviceLabel(BRAND);

const PREP_OPENING = "Happy to help. To make it specific, tell me who it's with and what you've observed — but here's the prep structure to work from in the meantime.";
const PREP_SAY = "**What to actually say** — state the observed behavior, explain why it matters, demonstrate the correct behavior or verbiage, require practice, set a follow-up expectation, and capture the employee's acknowledgement.";
const PREP_APPROACH = "As a general approach, hold it privately, early in the shift when there's still time to practice and watch it play out, and keep it to one focus so the person leaves knowing exactly what to do with the next guest.";
const PREP_REPLY = `${PREP_OPENING}\n\n${PREP_SAY}\n\n${PREP_APPROACH}`;

const CITED = "Name tags are worn and visible at all times while working [S1].";
const FORM_OFFER = "If you do need to document a conversation with someone, ask me to create a coaching form for them.";

const turn = (over: Partial<GeneralPracticeTurn>): GeneralPracticeTurn => ({
  reply: `${CITED}\n\nAs a general approach, walk the standard at a shift huddle before you send anyone home. ${FORM_OFFER}`,
  words: "whats the policy on name tags",
  brand: BRAND,
  formTurn: false,
  sourceTitles: [],
  ...over,
});

describe("settledGeneralPractice", () => {
  it("a cited policy answer: the unlabelled \"As a general approach…\" sentence goes; the cited text and the closing form offer stay", () => {
    expect(settledGeneralPractice(turn({}))).toBe(`${CITED}\n\n${FORM_OFFER}`);
  });

  it("an answer with source cards (its markers already taken out) is cited too", () => {
    const reply = `Name tags are worn and visible at all times while working.\n\nAs a general approach, walk the standard at a shift huddle. ${FORM_OFFER}`;
    expect(settledGeneralPractice(turn({ reply, cited: true }))).toBe(`Name tags are worn and visible at all times while working.\n\n${FORM_OFFER}`);
  });

  it("never drops a sentence that cites, even one that opens \"In general\"", () => {
    const reply = `${CITED}\n\nIn general, name tags go on the left (Name Tags, JBA Policy Manual p.15). Generally speaking, spares in the back help.`;
    expect(settledGeneralPractice(turn({ reply }))).toBe(`${CITED}\n\nIn general, name tags go on the left (Name Tags, JBA Policy Manual p.15).`);
  });

  it("this app's production coaching prep, uncited, on a general question: the practice gets the exact label instead of being dropped", () => {
    expect(settledGeneralPractice(turn({ reply: PREP_REPLY, words: "help me prepare a coaching conversation" }))).toBe(`${PREP_OPENING}\n\n${PREP_SAY}\n\n${LABEL}\n${PREP_APPROACH}`);
  });

  it("an uncited answer on pay, discipline or legal: dropped, never labelled", () => {
    for (const words of ["what should I pay a new hire?", "should I write her up for being late again?", "can I fire someone for complaining about their schedule?"]) {
      const out = settledGeneralPractice(turn({ reply: "That isn't in the documents; please check with HR or your manager.\n\nIn general, most stores start a little above minimum wage.", words }));
      expect(out, words).toBe("That isn't in the documents; please check with HR or your manager.");
    }
  });

  it("a form turn: dropped; a drafting ask and an already-labelled answer: untouched", () => {
    expect(settledGeneralPractice(turn({ reply: "I've started the coaching form below.\n\nAs a general approach, keep it private.", formTurn: true, words: "start a coaching form" }))).toBe("I've started the coaching form below.");
    const draft = "Here's your message:\n\nIn general, name tags stay on. Thanks, team!";
    expect(settledGeneralPractice(turn({ reply: draft, drafting: true }))).toBe(draft);
    const labelled = `Not in the documents.\n\n${LABEL}\nIn general, keep it short.`;
    expect(settledGeneralPractice(turn({ reply: labelled, words: "how do I run a huddle?" }))).toBe(labelled);
  });

  it("recognises the openers", () => {
    expect(opensGeneralPractice(PREP_APPROACH)).toBe(true);
    expect(opensGeneralPractice("Generally, name tags must be worn.")).toBe(false);
  });
});
