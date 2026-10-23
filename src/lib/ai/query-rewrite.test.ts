import { describe, expect, it } from "vitest";

import { queryRewriteEnabled } from "@/lib/config/chat-quality-flags";

import { queryAfterRewrite, shouldRewriteFollowUp } from "./query-rewrite";

describe("QUERY_REWRITE_ENABLED", () => {
  it("is off unless set to 1, true, on, or yes", () => {
    const previous = process.env.QUERY_REWRITE_ENABLED;
    try {
      for (const value of [undefined, "", "0", "false", "off", "no"]) {
        if (value === undefined) delete process.env.QUERY_REWRITE_ENABLED;
        else process.env.QUERY_REWRITE_ENABLED = value;
        expect(queryRewriteEnabled()).toBe(false);
      }
      for (const value of ["1", "true", "on", "yes"]) {
        process.env.QUERY_REWRITE_ENABLED = value;
        expect(queryRewriteEnabled()).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.QUERY_REWRITE_ENABLED;
      else process.env.QUERY_REWRITE_ENABLED = previous;
    }
  });

  it("a short follow-up is still rewritten, and a long question is not that case", () => {
    const history = [{ role: "user", content: "What does the attendance section say about being on time?" }];
    expect(shouldRewriteFollowUp("and for part-timers?", history)).toBe(true);
    expect(
      shouldRewriteFollowUp("what does the attendance section say about an employee who showed up late today?", history),
    ).toBe(false);
  });

  it("SKIP and an empty rewrite keep the question that was typed", () => {
    expect(queryAfterRewrite("create the form", "SKIP")).toBe("create the form");
    expect(queryAfterRewrite("create the form", "  ")).toBe("create the form");
    expect(queryAfterRewrite("she was late", "attendance late arrival")).toBe("attendance late arrival");
  });
});
