import { describe, expect, it } from "vitest";

import { missingAccountFacts, withAccountFactsKept } from "./account-facts-kept";

/*
 * Ported from the sibling app: QA's live test of its #1121 (20 Nov 2026, f061; the tester's invented person is Remy Calder here): the saved
 * Observation dropped "This is the third time in two months …" and "one customer said she would not come back …".
 */
const ACCOUNT =
  "Remy Calder finally arrived at 9:38, thirty-eight minutes after the scheduled opening time. During those thirty-eight minutes at least six walk-in orders were lost, two customers asked for refunds on their orders, and one customer said she would not come back because this was the second time she had been left waiting outside. This is the third time in two months that Remy Calder has opened late.";

describe("account facts kept (f061)", () => {
  it("adds the two facts the drafter dropped, in the card's words, at the end of Observed", () => {
    const drafted =
      "Observed:\nRemy Calder finally arrived at 9:38, thirty-eight minutes after the scheduled opening time. During those thirty-eight minutes at least six walk-in orders were lost and two customers asked for refunds on their orders.\n\nExpectation:\nRemy is expected to open on time.";
    const { text, added } = withAccountFactsKept(drafted, ACCOUNT, "Remy Calder");
    expect(added).toEqual([
      "One customer said she would not come back because this was the second time she had been left waiting outside.",
      "This is the third time in two months that Remy Calder has opened late.",
    ]);
    expect(text).toBe(
      "Observed:\nRemy Calder finally arrived at 9:38, thirty-eight minutes after the scheduled opening time. During those thirty-eight minutes at least six walk-in orders were lost and two customers asked for refunds on their orders. One customer said she would not come back because this was the second time she had been left waiting outside. This is the third time in two months that Remy Calder has opened late.\n\nExpectation:\nRemy is expected to open on time.",
    );
  });

  it("adds nothing when every fact is there, reworded or with the date written out", () => {
    const reworded =
      "Remy arrived at 9:38, thirty-eight minutes after the scheduled opening time. In those thirty-eight minutes at least six walk-in orders were lost, two customers requested order refunds, and one customer said she would not come back because this was the second time she had been left waiting outside. This is the third time in two months that Remy has opened late.";
    expect(missingAccountFacts(reworded, ACCOUNT, "Remy Calder")).toEqual([]);
    expect(missingAccountFacts("Observed:\nRemy was 20 minutes late to her shift on November 14, 2026.", "Remy was 20 minutes late to her shift on 11/14.", "Remy Calder")).toEqual([]);
  });

  it("changes nothing with no account or no write-up", () => {
    expect(withAccountFactsKept("Observed:\nRemy was late.", "", "Remy Calder")).toEqual({ text: "Observed:\nRemy was late.", added: [] });
    expect(withAccountFactsKept("", ACCOUNT, "Remy Calder")).toEqual({ text: "", added: [] });
  });
});

/*
 * QA's live test of #1152 (20 Nov 2026, f083; draft c6a29914, the person invented): "ca for <P>, she was 40 minutes late
 * on 11/18, this is the third time in two months, I've had two verbal talks with her already, and a customer said they
 * won't come back because nobody was at the desk". The card's account was appended whole: the lateness and the customer
 * twice, and the manager's "She". Only the missing fact is added, in the form's voice; a fact already there in other words
 * ("would not return" for "won't come back", "November 18, 2026" for "11/18") is never added again.
 */
describe("account facts kept: only the missing fact (f083)", () => {
  const card = "She was 40 minutes late on 11/18, this is the third time in two months. A customer said they won't come back because nobody was at the desk.";
  const drafted =
    "Observed:\nRemy was 40 minutes late to work on November 18, 2026. A customer stated they would not return because nobody was at the desk.\n\nExpectation:\nRemy is expected to arrive on time for every scheduled shift.";

  it("adds only \"This is the third time in two months.\", never the account again", () => {
    expect(missingAccountFacts(drafted, card, "Remy Calder")).toEqual(["This is the third time in two months."]);
    expect(withAccountFactsKept(drafted, card, "Remy Calder").text).toBe(
      "Observed:\nRemy was 40 minutes late to work on November 18, 2026. A customer stated they would not return because nobody was at the desk. This is the third time in two months.\n\nExpectation:\nRemy is expected to arrive on time for every scheduled shift.",
    );
  });

  it("an added clause that opens with she/he names the person by first name", () => {
    expect(missingAccountFacts("Observed:\nA customer complained.", "She left early on 11/18 without telling anyone.", "Remy Calder")).toEqual([
      "Remy left early on 11/18 without telling anyone.",
    ]);
  });
});

/*
 * QA2 (21 Nov 2026), #1180 live on main 37c2ad82, PARTIAL (the person invented): the live card's account read "She was 40
 * minutes late on 11/18, the third time in two months." The pass added that whole sentence ("<P> was 40 minutes late on
 * 11/18, the third time in two months."), so the lateness was stated twice. Only the missing clause is added, as a short
 * sentence of its own.
 */
describe("account facts kept: a missing appositive clause alone (f083 follow-up)", () => {
  const card = "She was 40 minutes late on 11/18, the third time in two months. A customer said they won't come back because nobody was at the desk.";
  const drafted =
    "Observed:\nRemy was 40 minutes late to work on November 18, 2026. A customer stated they would not return because nobody was at the desk.\n\nExpectation:\nRemy is expected to arrive on time for every scheduled shift.";

  it("adds \"This is the third time in two months.\", never the lateness again", () => {
    expect(missingAccountFacts(drafted, card, "Remy Calder")).toEqual(["This is the third time in two months."]);
  });

  it("a missing \"which …\" clause reads as its own sentence", () => {
    expect(missingAccountFacts("Observed:\nRemy was 40 minutes late on 11/18.", "Remy was 40 minutes late on 11/18, which made the store open late for six guests.", "Remy Calder")).toEqual([
      "This made the store open late for six guests.",
    ]);
  });
});

describe("account facts kept: a whole clause is never turned into a phrase", () => {
  it("\"…, the doors were not unlocked\" stays a sentence of its own", () => {
    expect(missingAccountFacts("Observed:\nRemy arrived at 9:38 on 11/18.", "Remy arrived at 9:38 on 11/18, the doors were not unlocked until then.", "Remy Calder")).toEqual([
      "The doors were not unlocked until then.",
    ]);
  });
});

/*
 * QA's live re-test of the loop (21 Nov 2026, A2–A5; Fenna Prewitt is invented, `loop-roster.ts`): every saved CA's
 * Observation stated the offense twice, "<P> did not attend the monthly meeting on October 20, 2026. <P> did not attend
 * the monthly meeting on 10-20-26.", and A3 also tacked on "...by the 10-15-26 deadline. On 10-20-26." The manager's
 * dashed dates were not read as the dates the drafter wrote out, so each sentence holding one looked missing.
 */
describe("account facts kept: a dashed date is the same date written out (QA live re-test, A2–A5)", () => {
  it("\"create verbal ca for <name> for not attending the monthly meeting on 10-20-26\": the reworded sentence holds it, nothing is added", () => {
    const drafted = "Observed:\nFenna did not attend the monthly meeting on October 20, 2026.\n\nExpectation:\nFenna is expected to attend every monthly meeting.";
    const { text, added } = withAccountFactsKept(drafted, "Fenna did not attend the monthly meeting on 10-20-26.", "Fenna Prewitt");
    expect(added).toEqual([]);
    expect(text).toBe(drafted);
  });

  it("A3: the drafter wrote both dates out; no \"This was due by the 10-15-26 deadline.\" and no dangling \"On 10-20-26.\" is tacked on", () => {
    const account = "On 10-20-26, Fenna had still not completed the food safety training, which was due by the 10-15-26 deadline.";
    const drafted = "Observed:\nAs of October 20, 2026, Fenna had still not completed the food safety training, which was due by the October 15, 2026 deadline.";
    expect(missingAccountFacts(drafted, account, "Fenna Prewitt")).toEqual([]);
  });

  it("control: a fact the drafter really dropped is still added, dashed date and all", () => {
    expect(missingAccountFacts("Observed:\nFenna did not attend the monthly meeting on October 20, 2026.", "Fenna did not attend the monthly meeting on 10-20-26. She also missed the 10-27-26 meeting.", "Fenna Prewitt")).toEqual([
      "Fenna also missed the 10-27-26 meeting.",
    ]);
  });
});

/*
 * Ported from the sibling app: its QA2's live R3 (21 Nov 2026; the person invented here: Odell Brannagh): the saved
 * Observed stated the lateness three times for two dates: "<First> was late to work on November 17, 2026. <First> was
 * late to work on November 18, 2026. <First> was late on the last two shifts, 11/17 and 11/18." The card's sentence lists
 * the two dates the drafter's two sentences already hold, so nothing is added.
 */
describe("account facts kept: a sentence listing dates the write-up states one by one (sibling's QA2 R3)", () => {
  const DRAFTED = "Observed:\nOdell was late to work on November 17, 2026. Odell was late to work on November 18, 2026.\n\nExpectation:\nOdell is expected to arrive on time for every scheduled shift.";

  it("\"<First> was late on the last two shifts, 11/17 and 11/18.\": each lateness is stated once", () => {
    const { text, added } = withAccountFactsKept(DRAFTED, "Odell was late on the last two shifts, 11/17 and 11/18.", "Odell Brannagh");
    expect(added).toEqual([]);
    expect(text).toBe(DRAFTED);
    expect(text.match(/was late/g)).toHaveLength(2);
  });

  it("control: a date the write-up does not hold, or a reason it left out, is still added", () => {
    expect(missingAccountFacts(DRAFTED, "Odell was late on the last three shifts, 11/16, 11/17 and 11/18.", "Odell Brannagh")).not.toEqual([]);
    expect(missingAccountFacts(DRAFTED, "Odell was late on 11/17 and 11/18 because his car broke down twice.", "Odell Brannagh")).not.toEqual([]);
  });
});

/*
 * QA's live re-run on production f9461c1 (22 Nov 2026, C3; the person invented here: Zelphine Harwick): "create a CA
 * form for <Last>, <First> at dodge. she was late on 10-16" saved "<First> was late to work on October 16, 2026. <First>
 * was late on 10-16.": the same fact twice. A dashed month-day with no year ("10-16") is read as a date only when the
 * write-up itself states that month and day, so a range ("10-12 hours") is never taken for one.
 */
describe("account facts kept: one dashed date with no year that the write-up states (QA's live re-run, C3)", () => {
  const DRAFTED = "Observed:\nZelphine was late to work on October 16, 2026.\n\nExpectation:\nZelphine is expected to arrive on time for every scheduled shift.";

  it("\"<First> was late on 10-16.\": the lateness is stated once", () => {
    const { text, added } = withAccountFactsKept(DRAFTED, "Zelphine was late on 10-16.", "Zelphine Harwick");
    expect(added).toEqual([]);
    expect(text).toBe(DRAFTED);
  });

  it("control: a dashed date the write-up does not state, or a range, is still read as typed", () => {
    expect(missingAccountFacts(DRAFTED, "Zelphine was also late on 10-23 and left before close.", "Zelphine Harwick")).not.toEqual([]);
    expect(missingAccountFacts(DRAFTED, "Zelphine has worked 10-16 hour shifts every weekend this month.", "Zelphine Harwick")).not.toEqual([]);
  });
});
