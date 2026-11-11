import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTIED_REPLY, withOwnBrandOnly } from "./own-brand-only";
import type { AskResponse } from "./types";

/**
 * BRAND_REPLY_GUARD_ENABLED (QA's October triage of #198, 10 Nov 2026). The replies are #198's own: what the answering
 * model wrote for "what does our policy say about attendance?", "changing availabilty" and late opening. On main with
 * production's flags (OWN_BRAND_ONLY and OWN_BRAND_PARENT on) the brand list kept the office, "SALON/STORE" stayed, and
 * the availability and late-opening replies were dropped whole, rule included.
 */
const REPLIES = {
  attendance:
    "The attendance policy applies across all brands (Buff City Soap, Crunch, Sun Tan City, JB & Associates office) [p.14]. A no call no show for a scheduled shift may result in immediate termination [p.14].",
  availability: "Submit availability changes two weeks ahead in MyGlow for Buff City Soap, MyGlow for Sun Tan City, or Woven for Crunch Fitness [p.37].",
  lateOpeningUpper: "IF YOU CAN'T OPEN THE SALON/STORE ON TIME, NOTIFY YOUR MANAGER [p.15]. The employee reimburses $25.00 via payroll deduction [p.15].",
  lateOpeningTerse: "The Late Opening policy applies for any brand under JB & Associates: the employee who failed to open reimburses $25.00 [p.15].",
};

function reply(content: string): string {
  return withOwnBrandOnly({ content, citations: [] } as unknown as AskResponse).content;
}

function production() {
  vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
  vi.stubEnv("OWN_BRAND_PARENT_ENABLED", "true");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("off (main, production's flags): #198's leaks", () => {
  it("the office stays in the list, SALON/STORE stays, two rules are dropped whole", () => {
    production();
    expect(reply(REPLIES.attendance)).toContain("(Buff City Soap, JB & Associates office)");
    expect(reply(REPLIES.lateOpeningUpper)).toContain("SALON/STORE");
    expect(reply(REPLIES.availability)).toBe("");
    expect(reply(REPLIES.lateOpeningTerse)).toBe("");
  });
});

describe("on: only this company, every rule kept, citations kept", () => {
  it("attendance: the brand list goes, the rule stays", () => {
    production();
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    expect(reply(REPLIES.attendance)).toBe(
      "The attendance policy applies across all brands [p.14]. A no call no show for a scheduled shift may result in immediate termination [p.14].",
    );
  });

  it('the sibling\'s #266 leftover, this company\'s names: "MyGlow for Buff City Soap, or MyGlow for Sun Tan City [p.37]" keeps this company\'s clause', () => {
    const said = "Submit availability changes in MyGlow for Buff City Soap, or MyGlow for Sun Tan City [p.37].";
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    expect(reply(said)).toBe("Submit availability changes in MyGlow for Buff City Soap [p.37].");
  });

  it("on: a reply the own-brand step would empty whole is never sent empty", () => {
    const said = "Crunch Fitness members check in with the Crunch app at the front desk [p.40].";
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    expect(reply(said)).toBe("");
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    expect(reply(said)).toBe(EMPTIED_REPLY);
  });

  it("availability: this company's own system is kept", () => {
    production();
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    expect(reply(REPLIES.availability)).toBe("Submit availability changes two weeks ahead in MyGlow for Buff City Soap [p.37].");
  });

  it('late opening: "SALON/STORE" is "STORE", in the case it was written in', () => {
    production();
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    expect(reply(REPLIES.lateOpeningUpper)).toBe(
      "IF YOU CAN'T OPEN THE STORE ON TIME, NOTIFY YOUR MANAGER [p.15]. The employee reimburses $25.00 via payroll deduction [p.15].",
    );
    expect(reply("If you can't open the salon/store on time, call your manager.")).toBe("If you can't open the store on time, call your manager.");
  });

  it('late opening: "for any brand under JB & Associates" is "at Buff City Soap"', () => {
    production();
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    expect(reply(REPLIES.lateOpeningTerse)).toBe(
      "The Late Opening policy applies at Buff City Soap: the employee who failed to open reimburses $25.00 [p.15].",
    );
  });

  it.each([
    ["all lowercase", (text: string) => text.toLowerCase()],
    ["sentence case", (text: string) => text.charAt(0) + text.slice(1).toLowerCase()],
  ])("%s: the same rules are kept and no other brand is named", (_register, recase) => {
    production();
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    for (const text of Object.values(REPLIES)) {
      const out = reply(recase(text));
      expect(out, text).not.toMatch(/sun\s+tan\s+city|crunch|jb\s*&\s*associates|salon/i);
      expect(out.length, text).toBeGreaterThan(20);
    }
  });

  it("a reply that names no other brand is untouched", () => {
    production();
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    const text = "Cite the JBA Policy Manual, Late Opening, p.15. Ask your store manager to approve the change.";
    expect(reply(text)).toBe(text);
  });
});
