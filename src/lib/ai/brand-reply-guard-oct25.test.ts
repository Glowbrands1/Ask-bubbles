import { afterEach, describe, expect, it, vi } from "vitest";

import { NOTHING_LEFT, withoutOtherBrands } from "./brand-reply-guard";

/**
 * ============================================================================
 * A REPLY SPEAKS FOR BUFF CITY SOAP ONLY (BRAND_REPLY_GUARD_ENABLED)
 * ============================================================================
 *
 * QA, 25 Oct 2026, production replies from testers G21, U1 and U6 (questions
 * in the managers' own register): "can i bring my dog to work", "pets at
 * work?", "what does our policy say about attendance?", "whats policy say
 * about store opening late", "late opening policy", "whats policy say about
 * changing availabilty". The replies below carry the leaked wording exactly as
 * reported; the rest of each reply is kept, with its [p.N] citations.
 */

afterEach(() => vi.unstubAllEnvs());
const on = () => vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
const LEAK = /sun\s+tan\s+city|\bSTC\b|crunch|jb\s*&\s*associates|tanning\s+room|\bsalons?\b/i;

const REPLIES = {
  pets: "Pets are not allowed in the workplace; only a trained service animal is permitted [p.30]. For Sun Tan City and Crunch tanning rooms specifically, service animals are allowed in the tanning room only with a manager's approval [p.50].",
  attendance:
    "The attendance policy applies across all brands (Buff City Soap, Crunch, Sun Tan City, JB & Associates office) [p.14]. A no call no show for a scheduled shift may result in immediate termination [p.14].",
  availability:
    "Submit availability changes two weeks ahead in MyGlow for Buff City Soap, MyGlow for Sun Tan City, or Woven for Crunch Fitness [p.37].",
  lateOpeningUpper: "IF YOU CAN'T OPEN THE SALON/STORE ON TIME, NOTIFY YOUR MANAGER [p.15]. The employee reimburses $25.00 via payroll deduction [p.15].",
  lateOpeningTerse: "The Late Opening policy applies for any brand under JB & Associates: the employee who failed to open reimburses $25.00 [p.15].",
};

describe("flag off: the reply as written (the leak)", () => {
  it.each(Object.entries(REPLIES))("%s", (_name, reply) => {
    expect(withoutOtherBrands(reply)).toBe(reply);
    expect(reply).toMatch(LEAK);
  });
});

describe("flag on: Buff City Soap only, citations kept", () => {
  it("pets: the tanning-room sentence goes, the policy stays", () => {
    on();
    expect(withoutOtherBrands(REPLIES.pets)).toBe(
      "Pets are not allowed in the workplace; only a trained service animal is permitted [p.30].",
    );
  });

  it("attendance: the brand list goes, the rule stays", () => {
    on();
    const out = withoutOtherBrands(REPLIES.attendance);
    expect(out).not.toMatch(LEAK);
    expect(out).toContain("The attendance policy applies across all brands [p.14].");
    expect(out).toContain("A no call no show for a scheduled shift may result in immediate termination [p.14].");
  });

  it("availability: Buff City Soap's own system is kept", () => {
    on();
    const out = withoutOtherBrands(REPLIES.availability);
    expect(out).not.toMatch(LEAK);
    expect(out).toContain("MyGlow for Buff City Soap");
    expect(out).toBe("Submit availability changes two weeks ahead in MyGlow for Buff City Soap [p.37].");
  });

  it('late opening: "salon/store" is "store"', () => {
    on();
    const out = withoutOtherBrands(REPLIES.lateOpeningUpper);
    expect(out).not.toMatch(LEAK);
    expect(out).toContain("OPEN THE store ON TIME");
    expect(out).toContain("[p.15]");
  });

  it('late opening: "for any brand under JB & Associates" is "at Buff City Soap"', () => {
    on();
    const out = withoutOtherBrands(REPLIES.lateOpeningTerse);
    expect(out).not.toMatch(LEAK);
    expect(out).toContain("at Buff City Soap");
    expect(out).toContain("$25.00 [p.15]");
  });
});

describe("flag on: what must stay", () => {
  it.each([
    "The JBA Policy Manual covers this on page 22 [p.22].",
    "Cite the JBA Policy Manual, Late Opening, p.15.",
    "Buff City Soap's dress code requires closed-toe shoes [p.15].",
    "Ask your store manager to approve the change.",
  ])("%s", (reply) => {
    on();
    expect(withoutOtherBrands(reply)).toBe(reply);
  });
});

/*
 * QA-2 review, 26 Oct 2026, and the Bubbles KB sweep (71 questions x 2 casings):
 * never an empty reply, never a renamed manual title, and the sibling
 * company's role titles and holiday lists come out.
 */
describe("flag on: QA-2 review", () => {
  it("never empties a reply", () => {
    on();
    expect(withoutOtherBrands("Sun Tan City applies to tanning rooms.")).toBe(NOTHING_LEFT);
    expect(NOTHING_LEFT).not.toMatch(LEAK);
  });

  it.each([
    'See "Salon Opening Policy" [p.15].',
    "Cite it as Late Opening, JB & Associates Policy Manual [p.14].",
    "The JB & Associates Policy Manual says to notify your manager [p.15].",
  ])("keeps quoted text and manual titles: %s", (reply) => {
    on();
    expect(withoutOtherBrands(reply)).toBe(reply);
  });

  it.each([
    ["Full-time is AMM/ASD/AGM – 30–35 hours per week [p.33].", "Full-time is AMM/AGM – 30–35 hours per week [p.33]."],
    [
      "PTO accrues for full-time Assistant Salon Directors/Assistant Makery Managers [p.41].",
      "PTO accrues for full-time Assistant Makery Managers [p.41].",
    ],
  ])("takes the sibling title out of a slash list: %s", (reply, expected) => {
    on();
    expect(withoutOtherBrands(reply)).toBe(expected);
  });

  it.each([
    "This applies across the brands covered by the manual — Buff City Soap, Crunch Fitness and Sun Tan City.",
    "Holidays: Buff City Soap stores close on Thanksgiving [p.42]. Sun Tan City: salons stay open on Memorial Day [p.42].",
    "These sources cover Sun Tan City performance coaching, discount, and dress code policy.",
  ])("KB sweep wording: %s", (reply) => {
    on();
    const out = withoutOtherBrands(reply);
    expect(out).not.toMatch(LEAK);
    expect(out.trim().length).toBeGreaterThan(0);
  });
});

/*
 * HOW REPLIES ARE TYPED (QA-5, 26 Oct 2026): the same replies all lowercase
 * and in sentence case, brand names included. The other brands are taken out
 * in each, and the reply keeps its policy and its citations.
 */
describe("flag on: the same result in lowercase and sentence case", () => {
  const lower = (text: string) => text.toLowerCase();
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

  it.each([
    ["attendance", REPLIES.attendance, /no call no show/i],
    ["availability", REPLIES.availability, /myglow for buff city soap/i],
    ["pets", REPLIES.pets, /service animal is permitted/i],
    ["lateOpeningTerse", REPLIES.lateOpeningTerse, /reimburses \$25\.00/i],
  ] as const)("%s", (_name, reply, kept) => {
    on();
    for (const typed of [lower(reply), sentence(reply)]) {
      const out = withoutOtherBrands(typed);
      expect(out).not.toMatch(LEAK);
      expect(out).toMatch(kept);
      expect(out).toMatch(/\[p\.\d+\]/);
    }
  });
});
