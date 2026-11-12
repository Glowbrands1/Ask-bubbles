import { afterEach, describe, expect, it, vi } from "vitest";

import { replyFromDiff } from "./form-diff-reply";

/** STEP_B_REPLY_KEEPS_LINES_ENABLED (QA's live draft test, 8 Nov 2026): a multi-line field is quoted line by line. */

const LABELS = { coaching_details: "Details of Coaching", other_topic: "Other" };
const DETAILS = "Observed:\nOttoline missed the monthly meeting on 10/10/26.\nShe was reminded about the meeting twice.\n\nExpectation:\nOttoline attends every meeting.";

afterEach(() => vi.unstubAllEnvs());

describe("replyFromDiff, a multi-line field", () => {
  it("is joined with \"; \" with the flag off (as before)", () => {
    vi.stubEnv("STEP_B_REPLY_KEEPS_LINES_ENABLED", "");
    expect(replyFromDiff({ changed: [{ key: "coaching_details", before: "", after: DETAILS }] } as never, LABELS)).toContain("Observed:; Ottoline missed");
  });

  it("is quoted line by line with the flag on; a one-line field is as before", () => {
    vi.stubEnv("STEP_B_REPLY_KEEPS_LINES_ENABLED", "1");
    expect(replyFromDiff({ changed: [{ key: "coaching_details", before: "", after: DETAILS }] } as never, LABELS)).toBe(
      "Changed Details of Coaching to:\n> Observed:\n> Ottoline missed the monthly meeting on 10/10/26.\n> She was reminded about the meeting twice.\n> Expectation:\n> Ottoline attends every meeting.",
    );
    expect(replyFromDiff({ changed: [{ key: "other_topic", before: "", after: "Showing up late" }] } as never, LABELS)).toBe('Changed Other to "Showing up late".');
  });
});

/*
 * REPLY_QUOTE_WHOLE_SENTENCES_ENABLED (QA's Bubbles 17q live check, 12 Nov 2026; invented names): after "add to the
 * expectation that she was reminded twice", the quoted line was cut mid-sentence ("…and to secure the…").
 */
const LONG =
  "Expectation:\nOttoline is expected to close the store on time, count the drawer with the shift lead, and to secure the back door and the stockroom before she leaves. She was reminded twice.";

describe("replyFromDiff, a long quoted line", () => {
  it("off: cut at 120 characters, as before", () => {
    vi.stubEnv("STEP_B_REPLY_KEEPS_LINES_ENABLED", "1");
    vi.stubEnv("REPLY_QUOTE_WHOLE_SENTENCES_ENABLED", "");
    expect(replyFromDiff({ changed: [{ key: "coaching_details", before: "", after: LONG }] } as never, LABELS)).toMatch(/…$/);
  });

  it("on: the line is quoted whole, never cut mid-sentence", () => {
    vi.stubEnv("STEP_B_REPLY_KEEPS_LINES_ENABLED", "1");
    vi.stubEnv("REPLY_QUOTE_WHOLE_SENTENCES_ENABLED", "true");
    expect(replyFromDiff({ changed: [{ key: "coaching_details", before: "", after: LONG }] } as never, LABELS)).toBe(
      "Changed Details of Coaching to:\n> Expectation:\n> Ottoline is expected to close the store on time, count the drawer with the shift lead, and to secure the back door and the stockroom before she leaves. She was reminded twice.",
    );
  });

  it("on: a line past 600 characters ends at its last whole sentence", () => {
    vi.stubEnv("STEP_B_REPLY_KEEPS_LINES_ENABLED", "1");
    vi.stubEnv("REPLY_QUOTE_WHOLE_SENTENCES_ENABLED", "true");
    const sentence = "Ottoline is expected to close the store on time and to secure the back door before she leaves. ";
    const reply = replyFromDiff({ changed: [{ key: "coaching_details", before: "", after: `Expectation:\n${sentence.repeat(8).trim()}` }] } as never, LABELS);
    const quoted = reply.split("\n").at(-1)!;
    expect(quoted).toMatch(/leaves\. …$/);
    expect(quoted.length).toBeLessThanOrEqual(605);
  });
});
