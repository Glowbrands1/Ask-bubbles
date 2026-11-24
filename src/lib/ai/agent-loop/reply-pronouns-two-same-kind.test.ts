import { describe, expect, it } from "vitest";

import { firstNameNotPronouns, otherRosterPeopleIn } from "@/lib/forms/first-name-write-up";

import { withoutPersonPronouns } from "./reply-pronouns";

/*
 * QA (22 Nov 2026, production; the people invented): the manager wrote about <A> (she) and a coworker <B> (she) who was
 * giving <A> an attitude, and the write-up said "<A> was giving <A> an attitude". A pronoun whose nearest named person of
 * its kind is the other person stays as written; an object pronoun is never the person named in its own clause.
 */
const TWO_SHE_WORDS = "ca for Fenna Prewitt, she got into it with her coworker Thaddea Kroll on register last night. she was giving her an attitude and Fenna cussed at her in front of guests";
const TWO_SHE = "Fenna got into it with her coworker Thaddea Kroll on register on 11/21/26. She was giving her an attitude, and Fenna cussed at her in front of guests.";
const HE_WORDS = "ca for Fenna Prewitt, she got into it with her coworker Ozren Brack on register last night. he was giving her an attitude and Fenna cussed at him in front of guests";
const HE = "Fenna got into it with her coworker Ozren Brack on register on 11/21/26. He was giving her an attitude, and Fenna cussed at him in front of guests.";

describe("two people of one pronoun kind", () => {
  it("the coworker's \"she\" and \"her\" stay as the manager wrote them", () => {
    const { text } = withoutPersonPronouns(TWO_SHE, "Fenna", ["Thaddea Kroll"], TWO_SHE_WORDS);
    expect(text).toBe("Fenna got into it with Fenna's coworker Thaddea Kroll on register on 11/21/26. She was giving her an attitude, and Fenna cussed at her in front of guests.");
  });

  it("an object pronoun after the coworker named as her clause's subject is the employee (\"Thaddea was giving Fenna an attitude\")", () => {
    const words = "ca for Fenna Prewitt, thaddea kroll was on register with her. she was giving her an attitude";
    const { text } = withoutPersonPronouns("Fenna was on register with Thaddea Kroll on 11/21/26. Thaddea was giving her an attitude.", "Fenna", ["Thaddea Kroll"], words);
    expect(text).toBe("Fenna was on register with Thaddea Kroll on 11/21/26. Thaddea was giving Fenna an attitude.");
  });

  it("Create's write-up opening with the coworker's sentence (nobody named before it): left as written, never the employee", () => {
    const saved = "She was giving her an attitude, and Fenna cussed at her in front of guests. Fenna got into it with coworker Thaddea Kroll on register last night.";
    const { text } = withoutPersonPronouns(saved, "Fenna", ["Thaddea Kroll"], TWO_SHE_WORDS);
    expect(text).toBe(saved);
  });

  it("control, one \"she\": still named", () => {
    const { text } = withoutPersonPronouns("Fenna was rude to a guest on 11/21/26. She rolled her eyes at the guest and walked off.", "Fenna", [], "ca for Fenna Prewitt, she was rude to a guest. she rolled her eyes at the guest and walked off");
    expect(text).not.toMatch(/\b[Ss]he\b/);
    expect(text).toMatch(/Fenna rolled/);
  });

  it("control, the coworker is \"he\": his \"he\" and \"him\" stay, her \"her\" is named", () => {
    const { text } = withoutPersonPronouns(HE, "Fenna", ["Ozren Brack"], HE_WORDS);
    expect(text).toBe("Fenna got into it with Fenna's coworker Ozren Brack on register on 11/21/26. He was giving Fenna an attitude, and Fenna cussed at him in front of guests.");
  });

  it("another person named with no pronoun of theirs reads as before", () => {
    const words = "ca for Fenna Prewitt, she was late and Thaddea Kroll covered";
    const text = "Thaddea Kroll covered the register on 11/21/26. She was 40 minutes late.";
    expect(withoutPersonPronouns(text, "Fenna", ["Thaddea Kroll"], words).text).toBe("Thaddea Kroll covered the register on 11/21/26. Fenna was 40 minutes late.");
  });
});

describe("the saved write-up (Create): the notes' roster people", () => {
  const roster = [
    { firstName: "Fenna", lastName: "Prewitt", preferredFirstName: null },
    { firstName: "Thaddea", lastName: "Kroll", preferredFirstName: null },
    { firstName: "Ozren", lastName: "Brack", preferredFirstName: null },
    { firstName: "Perpetua", lastName: "Hensleigh", preferredFirstName: "Pip" },
  ];

  it("reads the other roster people the notes name, never the employee by their legal or preferred name", () => {
    expect(otherRosterPeopleIn(TWO_SHE_WORDS, roster, "Fenna Prewitt")).toEqual(["Thaddea Kroll"]);
    expect(otherRosterPeopleIn("ca for pip hensleigh (perpetua in woven), thaddea was rude", roster, "Pip Hensleigh")).toEqual(["Thaddea Kroll"]);
  });

  it("the coworker's \"she\" is never the employee in the saved Observation", () => {
    const out = firstNameNotPronouns({ observation: TWO_SHE }, "Fenna Prewitt", new Set(["observation"]), { others: otherRosterPeopleIn(TWO_SHE_WORDS, roster, "Fenna Prewitt"), managerWords: TWO_SHE_WORDS });
    expect(out.values.observation).not.toMatch(/Fenna was giving|Fenna cussed at Fenna/);
  });

  it("without the people (as before), unchanged behaviour", () => {
    const out = firstNameNotPronouns({ observation: "She was late on 11/21/26." }, "Fenna Prewitt", new Set(["observation"]));
    expect(out.values.observation).toBe("Fenna was late on 11/21/26.");
  });
});
