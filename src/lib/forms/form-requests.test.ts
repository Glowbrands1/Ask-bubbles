import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readFormRequests } = await import("./form-requests");

/**
 * Several forms in one message, each with its own person and words. Owner's
 * signed-in QA, 8 Oct 2026. All people are synthetic.
 */
const brief = (text: string) => {
  const reading = readFormRequests(text);
  if (!reading) return null;
  const list = (entries: { templateKey: string; employeeName: string | null }[]) =>
    entries.map((entry) => `${entry.templateKey}:${entry.employeeName?.toLowerCase() ?? "-"}`);
  return { requests: list(reading.requests), declined: list(reading.declined), conditional: list(reading.conditional) };
};

describe("readFormRequests", () => {
  it.each([
    ["coaching form for Avery Testperson and a CA for Jordan Testperson", ["coaching:avery testperson", "dpoa:jordan testperson"]],
    ["Coaching form for Avery Testperson. Also a CA for Jordan Testperson.", ["coaching:avery testperson", "dpoa:jordan testperson"]],
    ["coaching form for Avery Testperson, CA for Jordan Testperson", ["coaching:avery testperson", "dpoa:jordan testperson"]],
    ["a coaching form and a CA for Jordan Testperson", ["coaching:jordan testperson", "dpoa:jordan testperson"]],
    ["coaching forms for Avery Testperson and Jordan Testperson", ["coaching:avery testperson", "coaching:jordan testperson"]],
  ])("%s → separate requests", (text, requests) => {
    expect(brief(text)?.requests).toEqual(requests);
  });

  it.each([
    "jordan testperson needs a written warning for cash handling",
    "coaching form for Avery Testperson and Jordan Testperson",
    "coaching form for Avery Testperson, actually make it a CA",
    "coaching - policy review for Avery Testperson",
    "pull up a transfer form for jane doe, she is a pt tc at $12/hr, transferring from store 12 to salon 18 effective oct 5, same title, voluntary",
  ])("%s → one request: the single-form path reads it", (text) => {
    expect(brief(text)).toBeNull();
  });

  it("a declined form is set aside, not requested", () => {
    expect(brief("coaching form for Avery Testperson but no CA for Jordan Testperson")).toEqual({
      requests: ["coaching:avery testperson"],
      declined: ["dpoa:jordan testperson"],
      conditional: [],
    });
  });

  it("a conditional form is set aside, not requested", () => {
    expect(brief("coaching form for Avery Testperson and if Jordan Testperson is late again a CA for him")).toEqual({
      requests: ["coaching:avery testperson"],
      declined: [],
      conditional: ["dpoa:jordan testperson"],
    });
  });
});
