import { describe, expect, it } from "vitest";

import { withoutPersonPronouns } from "./reply-pronouns";

/*
 * QA's Bubbles round 2 (22 Nov 2026, U23), the manager's words (the person invented): "Today, while checking out a
 * customer, she asked another employee what they would do if they had 8 arms and 8 legs." became "<P> asked another
 * employee what <P> would do if <P> had 8 arms and 8 legs": "they" was the other employee.
 */
const U23 = "Today, while checking out a customer, she asked another employee what they would do if they had 8 arms and 8 legs.";

describe("a pronoun of another person in a reported clause stays (U23)", () => {
  it("\"they\" in a clause \"she\" reports is the other employee", () => {
    const { text } = withoutPersonPronouns(`**Observation of Offense:** ${U23}`, "Fenna");
    expect(text).toContain("Fenna asked another employee what they would do if they had 8 arms and 8 legs.");
  });

  it("the card's person's own pronoun in her reported clause is still named", () => {
    const { text } = withoutPersonPronouns("**Observation of Offense:** She said she was sick.", "Fenna");
    expect(text).toBe("**Observation of Offense:** Fenna said Fenna was sick.");
  });
});

/*
 * QA's live round-2 re-run (22 Nov 2026, U23, T5/T6): after the card pass named the reporter ("Tamsin asked another
 * employee what they would do …"), the reply pass replaced "they" too, because its reporter is now the person's name.
 * The manager calls the person "she": a "they" is someone else wherever it stands.
 */
describe("withoutPersonPronouns: the person's own pronoun is the manager's (U23 live, T5/T6)", () => {
  const MANAGER = "Today, while checking out a customer, she asked another employee what they would do if they had 8 arms and 8 legs.";
  it("\"Tamsin asked another employee what they would do if they had 8 arms\" keeps both \"they\"", () => {
    const text = "Today, while checking out a customer, Tamsin asked another employee what they would do if they had 8 arms and 8 legs.";
    expect(withoutPersonPronouns(text, "Tamsin", [], MANAGER).text).toBe(text);
  });
  it("control: the manager's \"she\" for the person is still named", () => {
    expect(withoutPersonPronouns("She said she was sick.", "Tamsin", [], "she said she was sick").text).toBe("Tamsin said Tamsin was sick.");
  });
});
