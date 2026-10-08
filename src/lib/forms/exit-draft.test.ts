import { describe, expect, it, vi } from "vitest";

import { dropHeaderRestatement } from "./exit-draft";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * DETAILS DOES NOT SAY THE HEADER AGAIN
 * ============================================================================
 *
 * HR feedback, 30 Sep 2026: "Harper Samples worked as a tanning consultant at
 * the Manhattan location (THIS CAN BE OMITTED)." Name, Job Title and Location
 * are printed above Details. Only a sentence or aside that says nothing else
 * is cut, and only when it names the form's own job title.
 */

const HARPER = { jobTitle: "Tanning Consultant", locationName: "KS Manhattan" };

describe("dropHeaderRestatement", () => {
  it("drops the Harper sentence and keeps the rest word for word", () => {
    const result = dropHeaderRestatement(
      "Harper Samples worked as a tanning consultant at the Manhattan location. On 9-15-26, she provided her resignation to management, sending the message via Woven. She gave and worked a two week notice, and her last day worked was 9-28-26.",
      HARPER,
    );
    expect(result.value).toBe(
      "On 9-15-26, she provided her resignation to management, sending the message via Woven. She gave and worked a two week notice, and her last day worked was 9-28-26.",
    );
    expect(result.removed).toEqual(["Harper Samples worked as a tanning consultant at the Manhattan location."]);
  });

  it.each([
    "Harper was a Tanning Consultant at KS Manhattan.",
    "Harper worked as a tanning consultant.",
    "She was employed as a tanning consultant at the Manhattan salon.",
  ])("drops %s", (sentence) => {
    expect(dropHeaderRestatement(`${sentence} Harper resigned on 9/15.`, HARPER).value).toBe("Harper resigned on 9/15.");
  });

  it("cuts an aside that only restates the header, and keeps its sentence", () => {
    const result = dropHeaderRestatement(
      "Kayla Rowan, a Tanning Consultant at NE Kearney, gave notice on 9/25/26 and fulfilled that notice.",
      { jobTitle: "Tanning Consultant", locationName: "NE Kearney" },
    );
    expect(result.value).toBe("Kayla Rowan gave notice on 9/25/26 and fulfilled that notice.");
    expect(result.removed).toEqual(["a Tanning Consultant at NE Kearney"]);
  });

  it.each([
    // A fact about the departure, a date, or a different role or salon stays.
    "Harper worked as a tanning consultant at the Manhattan location until 9/28.",
    "Harper transferred from the Manhattan location to Lawrence before resigning.",
    "Harper was promoted from tanning consultant to assistant salon director in August.",
    "Harper worked as an assistant salon director at the Manhattan location.",
    "Harper was a tanning consultant at the Lawrence location before she moved.",
  ])("keeps %s", (sentence) => {
    expect(dropHeaderRestatement(sentence, HARPER)).toEqual({ value: sentence, removed: [] });
  });

  it("does nothing without a job title on the form", () => {
    const text = "Harper worked as a tanning consultant at the Manhattan location.";
    expect(dropHeaderRestatement(text, { jobTitle: null, locationName: "KS Manhattan" }).value).toBe(text);
  });
});
