import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { fewShotExamplesEnabled } from "@/lib/config/chat-quality-flags";

import { buildSystemPrompt } from "./prompts";
import { formatFewShot, replayCasesFromFeedback, similarExchanges } from "./feedback-eval";

const PLACES = ["Kearney, NE", "Lee's Summit, MO"];

const CONTEXT = {
  userName: "A Manager",
  locationName: "Kearney, NE",
  todayIso: "2026-10-23",
};

describe("1–4 star ratings become redacted replay cases", () => {
  it("drops a 5-star row and redacts the person, the store, and the contact details", () => {
    const cases = replayCasesFromFeedback(
      [
        {
          rating: 2,
          question:
            "Marissa Lempka at Kearney, NE showed up late. Reach me at marissa.lempka@example.com or 402-555-0100. Ref 11111111-1111-4111-8111-111111111111.",
          comment: "The attendance answer missed the page.",
        },
        { rating: 5, question: "What does attendance say about being on time?", comment: "Clear." },
        { rating: 1, question: null, comment: "Wrong store: Lee's Summit, MO." },
      ],
      PLACES,
    );
    expect(cases).toHaveLength(2);
    expect(cases[0]?.rating).toBe(2);
    expect(cases[0]?.question).not.toContain("Marissa");
    expect(cases[0]?.question).not.toContain("Lempka");
    expect(cases[0]?.question).not.toContain("Kearney");
    expect(cases[0]?.question).not.toContain("example.com");
    expect(cases[0]?.question).not.toContain("402");
    expect(cases[0]?.question).not.toContain("11111111");
    expect(cases[0]?.question).toContain("the employee");
    expect(cases[0]?.question).toContain("the store");
    expect(cases[0]?.question).toContain("[redacted]");
    expect(cases[0]?.comment).toBe("The attendance answer missed the page.");
    expect(cases[1]?.question).toBeNull();
    expect(cases[1]?.comment).toContain("the store");
    expect(cases[1]?.comment).not.toContain("Lee's Summit");
  });

  it("the script writes those cases to stdout and does not keep the raw row", () => {
    const input = {
      places: PLACES,
      rows: [
        {
          rating: 3,
          question: "Corrective action for Marissa Lempka at Kearney, NE",
          comment: "Asked me for the name again.",
        },
      ],
    };
    const result = spawnSync("node", ["scripts/feedback-to-eval.mjs"], {
      input: JSON.stringify(input),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const cases = JSON.parse(result.stdout);
    expect(cases).toEqual(replayCasesFromFeedback(input.rows, input.places));
    expect(result.stdout).not.toContain("Marissa");
    expect(result.stdout).not.toContain("Kearney");
  });
});

describe("FEWSHOT_EXAMPLES_ENABLED", () => {
  it("is off unless set to 1, true, on, or yes", () => {
    const previous = process.env.FEWSHOT_EXAMPLES_ENABLED;
    try {
      for (const value of [undefined, "", "0", "false", "off", "no"]) {
        if (value === undefined) delete process.env.FEWSHOT_EXAMPLES_ENABLED;
        else process.env.FEWSHOT_EXAMPLES_ENABLED = value;
        expect(fewShotExamplesEnabled()).toBe(false);
      }
      for (const value of ["1", "true", "on", "yes", " YES "]) {
        process.env.FEWSHOT_EXAMPLES_ENABLED = value;
        expect(fewShotExamplesEnabled()).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.FEWSHOT_EXAMPLES_ENABLED;
      else process.env.FEWSHOT_EXAMPLES_ENABLED = previous;
    }
  });

  it("uses a similar 5-star question and leaves an unrelated one out", () => {
    const rows = [
      { rating: 5, question: "What does the attendance policy say about showing up late?", comment: "It cited the page." },
      { rating: 5, question: "How do I count the towels at close?", comment: null },
      { rating: 2, question: "What does the attendance policy say about showing up late?", comment: "Missed it." },
    ];
    const picked = similarExchanges("she showed up late, what does attendance say?", rows);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.rating).toBe(5);
    const block = formatFewShot("she showed up late, what does attendance say?", rows, PLACES);
    expect(block).toContain("HIGHLY RATED EXCHANGES");
    expect(block).toContain("attendance");
    expect(block).toContain("It cited the page.");
    expect(block).not.toContain("towels");
    expect(formatFewShot("hi", rows, PLACES)).toBeNull();
  });

  it("redacts a name inside a highly rated question", () => {
    const block = formatFewShot(
      "attendance for a late arrival",
      [{ rating: 5, question: "Attendance for Marissa Lempka at Kearney, NE who was late", comment: null }],
      PLACES,
    );
    expect(block).not.toContain("Marissa");
    expect(block).not.toContain("Kearney");
    expect(block).toContain("the employee");
    expect(block).toContain("the store");
  });

  it("adds nothing to the prompt when no examples are passed", () => {
    const base = {
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "store",
      context: CONTEXT,
      mode: "standard" as const,
      hasContext: true,
    };
    expect(buildSystemPrompt(base)).toBe(buildSystemPrompt({ ...base, fewShotExamples: null }));
    expect(buildSystemPrompt(base)).not.toContain("HIGHLY RATED EXCHANGES");
    expect(buildSystemPrompt({ ...base, fewShotExamples: "HIGHLY RATED EXCHANGES\n\n1. A manager asked: attendance." })).toContain(
      "HIGHLY RATED EXCHANGES",
    );
  });
});
