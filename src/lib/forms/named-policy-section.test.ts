import { afterEach, describe, expect, it, vi } from "vitest";

import type { ManualChunk } from "./official-policy-manual";
import {
  describedManualChoices,
  describedManualSection,
  manualSectionNamedBy,
  namedManualSection,
  namedPolicies,
  namesHeading,
} from "./named-policy-section";

/**
 * A policy the manager names, matched against the pinned manual's own sheet
 * headings — District Manager feedback, 21 Oct 2026: "violating visitors at
 * work policy" is the manual's "Visitors in the Workplace". Generic: nothing
 * here lists that phrase; the headings below are the manual's.
 */

const sheet = (chunkIndex: number, heading: string, page: number): ManualChunk => ({
  chunkIndex,
  page: page + 1,
  printedPage: page,
  sections: [{ heading, page }],
  section: heading,
  content: `${heading}\nText of the section.`,
});

const CHUNKS: ManualChunk[] = [
  sheet(30, "Standards of Conduct", 12),
  sheet(33, "Attendance", 14),
  sheet(34, "Late Opening", 15),
  sheet(35, "Dress Code for The Company", 15),
  sheet(55, "Safety in the Workplace", 25),
  sheet(64, "Visitors in the Workplace", 30),
  sheet(65, "Animals in the Workplace", 30),
  sheet(70, "Cell Phone Usage", 32),
];

afterEach(() => vi.unstubAllEnvs());

describe("namesHeading", () => {
  it.each([
    ["visitors at work", "Visitors in the Workplace"],
    ["visitor", "Visitors in the Workplace"],
    ["visitors in the workplace", "Visitors in the Workplace"],
    ["cell phone", "Cell Phone Usage"],
    ["late opening", "Late Opening"],
  ])("%s → %s", (phrase, heading) => {
    expect(namesHeading(phrase, heading)).toBe(true);
  });

  it.each([
    ["cell phone", "Cell Phone/Smart Watch Policy"],
    ["smart watch", "Cell Phone/Smart Watch Policy"],
    ["cell phone/smart watch", "Cell Phone/Smart Watch Policy"],
  ])("%s → %s: either side of a heading's slash names it", (phrase, heading) => {
    expect(namesHeading(phrase, heading)).toBe(true);
  });

  it.each([
    ["phone", "Cell Phone/Smart Watch Policy"],
    ["unicorn phone", "Cell Phone/Smart Watch Policy"],
    ["workplace", "Visitors in the Workplace"],
    ["visitors at work", "Animals in the Workplace"],
    ["phone", "Cell Phone Usage"],
    ["opening", "Late Opening"],
  ])("%s is not %s", (phrase, heading) => {
    expect(namesHeading(phrase, heading)).toBe(false);
  });
});

describe("namedPolicies", () => {
  it("reads the words a verb names as a policy", () => {
    expect(
      namedPolicies(
        "create verbal CA for remy calder for violating visitors at work policy on 10-10-26. juno spent 40 minutes talking with friend",
      ).map((named) => named.phrase),
    ).toEqual(["visitors at work"]);
    expect(namedPolicies("she broke the cell phone policy again").map((named) => named.phrase)).toEqual(["cell phone"]);
  });

  it("names none in a question, or in 'company policy' alone", () => {
    expect(namedPolicies("is that against the visitor policy?")).toEqual([]);
    expect(namedPolicies("violation of company policy")).toEqual([]);
  });
});

describe("namedManualSection", () => {
  it("finds the manual's section, its printed page, and the box it is cited under", () => {
    const found = namedManualSection({ text: "for violating visitors at work policy on 10-10-26", chunks: CHUNKS });
    expect(found).toMatchObject({
      phrase: "visitors at work",
      section: { heading: "Visitors in the Workplace", page: 30 },
      offenseKey: "company_policies",
    });
  });

  it("cites a section a box already cites under that box", () => {
    expect(namedManualSection({ text: "violated the late opening policy", chunks: CHUNKS })?.offenseKey).toBe("tardiness");
  });

  it("fails closed: no heading, two headings, or no manual", () => {
    expect(namedManualSection({ text: "violating the unicorn parking policy", chunks: CHUNKS })).toBeNull();
    expect(namedManualSection({ text: "violating the workplace policy", chunks: CHUNKS })).toBeNull();
    expect(namedManualSection({ text: "violating visitors at work policy", chunks: null })).toBeNull();
    expect(
      namedManualSection({
        text: "violating visitors at work policy",
        chunks: [...CHUNKS, sheet(90, "Visitors at Work", 40)],
      }),
    ).toBeNull();
  });
});

describe("manualSectionNamedBy — the same reading, for a policy named for an open form", () => {
  it("finds the one section the words name, or nothing", () => {
    expect(manualSectionNamedBy("visitors at work", CHUNKS)).toMatchObject({ heading: "Visitors in the Workplace", page: 30 });
    expect(manualSectionNamedBy("cell phone", CHUNKS)).toMatchObject({ heading: "Cell Phone Usage", page: 32 });
    expect(manualSectionNamedBy("workplace", CHUNKS)).toBeNull();
    expect(manualSectionNamedBy("the", CHUNKS)).toBeNull();
    expect(manualSectionNamedBy("visitors at work", null)).toBeNull();
  });
});

/*
 * District Manager feedback, 21 Oct 2026: "on 10-20-26 <employee> was talking
 * on her cell phone for over 30 minutes" named no policy and was cited under
 * the Standards of Conduct. Headings below are the 2025 JBA Policy Manual's
 * own, including the ones that would collide with a looser reading.
 */
describe("describedManualSection — a policy the account describes", () => {
  const MANUAL: ManualChunk[] = [
    sheet(30, "Standards of Conduct", 12),
    sheet(32, "Disciplinary Action", 14),
    sheet(33, "Attendance", 14),
    sheet(34, "Late Opening", 15),
    sheet(35, "Dress Code for The Company", 15),
    sheet(36, "Belts", 15),
    sheet(37, "Texting as General Work communications", 15),
    sheet(40, "Open Door Policy", 8),
    sheet(42, "Coupon Collection", 19),
    sheet(43, "Cell Phone/Smart Watch Policy", 19),
    sheet(44, "Background Checks", 21),
    sheet(45, "Talking to the Media/Press", 22),
    sheet(46, "Social Media Policy", 22),
    sheet(47, "Using Social Media at Work", 23),
    sheet(64, "Visitors in the Workplace", 29),
    sheet(81, "Schedule Requests/General availability Changes", 37),
    sheet(82, "Leave Requests", 46),
  ];
  const described = (text: string) => describedManualSection({ text, chunks: MANUAL });

  it.each([
    [
      "create a verbal corrective action form for remy calder. on 10-20-26 remy was talking on her cell phone for over 30 minutes",
      "cell phone",
      "Cell Phone/Smart Watch Policy",
    ],
    ["she was on her phone for 20 minutes while guests waited", "phone", "Cell Phone/Smart Watch Policy"],
    ["tess was on her cell for an hour", "cell", "Cell Phone/Smart Watch Policy"],
    ["she was looking at her smart watch all afternoon", "smart watch", "Cell Phone/Smart Watch Policy"],
  ])("%s → %s → %s", (text, phrase, heading) => {
    const found = described(text);
    expect(found).toMatchObject({ phrase, section: { heading }, offenseKey: "company_policies" });
  });

  it("cites the page the manual prints", () => {
    expect(described("remy was talking on her cell phone")!.section.page).toBe(19);
  });

  it.each([
    /* Incidental mentions. */
    "she left her phone number on the schedule",
    "she called in by phone to say she would be out sick",
    "her friend came to visit",
    /* A rule, not an account. */
    "belts must not hold cell phones",
    /* Two headings answer: nothing. */
    "she wore a belt that holds her cell phone",
    "she was posting on social media",
    /* Words a heading shares with every account. */
    "create a disciplinary action form for tess. she was rude to a guest",
    "she did not check the schedule",
    "tess left the back door open all night",
    "she was talking to a guest about her weekend",
    "she gave a guest a coupon",
    /*
     * One heading answers, but the manual does not title it a Policy: an
     * account cites unnamed only a section the manual calls a Policy (Bubbles
     * PR #63). Named — "violating visitors at work policy" — it is still cited.
     */
    "her friend was visiting for an hour behind the counter",
    "she let two visitors into the back room",
    "she did not follow the coupon collection process",
  ])("%s → nothing", (text) => {
    /* The flag is set explicitly: this list is what the code reads with it OFF. The ON twin is below. */
    vi.stubEnv("POLICY_SPECIFIC_TOPICS_ENABLED", "");
    expect(described(text)).toBeNull();
  });

  /*
   * POLICY_SPECIFIC_TOPICS_ENABLED changes two lines of the list above on
   * purpose (QA rulings, 26 Oct 2026): a social media POST is the Social
   * Media Policy, and a guest or client treated rudely is the Standards of
   * Conduct, page 12. The rest of policy-specific-topics-oct26.test.ts covers
   * the flag's other incidents.
   */
  it.each([
    ["she was posting on social media", "Social Media Policy"],
    ["create a disciplinary action form for tess. she was rude to a guest", "Standards of Conduct"],
    ["create a disciplinary action form for tess. she was rude to a client", "Standards of Conduct"],
  ])("POLICY_SPECIFIC_TOPICS_ENABLED on: %s → %s", (text, heading) => {
    vi.stubEnv("POLICY_SPECIFIC_TOPICS_ENABLED", "true");
    expect(described(text)?.section.heading).toBe(heading);
  });

  it("never over what already decides the policy", () => {
    /* A policy named — found, or not — is the manager's. */
    expect(described("violating the unicorn parking policy. she was on her cell phone")).toBeNull();
    expect(described("for violating the dress code. she was on her cell phone")).toBeNull();
    /* Attendance, a late opening, dress code: their own boxes. */
    expect(described("she was 20 minutes late because she was on her cell phone")).toBeNull();
    expect(described("she opened the store late and was on her cell phone")).toBeNull();
    expect(described("her uniform was dirty and she was on her cell phone")).toBeNull();
    /* A conduct incident the Standards of Conduct lists. */
    expect(described("she refused to follow my direction to put her cell phone away")).toBeNull();
    /* A question describes nothing. */
    expect(described("was she on her cell phone?")).toBeNull();
    /* No manual. */
    expect(describedManualSection({ text: "on her cell phone", chunks: null })).toBeNull();
  });

  it("is read from the manual's headings, not a list: a manual without the section cites nothing", () => {
    expect(
      describedManualSection({
        text: "remy was talking on her cell phone",
        chunks: MANUAL.filter((chunk) => chunk.section !== "Cell Phone/Smart Watch Policy"),
      }),
    ).toBeNull();
  });
});

/*
 * QA follow-up, 22 Oct 2026: "scrolling social media on her phone" answers both
 * the Cell Phone/Smart Watch Policy and the Social Media Policy. No section is
 * chosen — and the manager is asked which, offered both with their pages.
 */
describe("describedManualChoices — an account two Policy sections answer", () => {
  const MANUAL: ManualChunk[] = [
    sheet(30, "Standards of Conduct", 12),
    sheet(36, "Belts", 15),
    sheet(37, "Texting as General Work communications", 15),
    sheet(43, "Cell Phone/Smart Watch Policy", 19),
    sheet(46, "Social Media Policy", 22),
    sheet(47, "Using Social Media at Work", 23),
  ];
  const choices = (text: string) =>
    describedManualChoices({ text, chunks: MANUAL })?.map((found) => [found.section.heading, found.section.page]) ?? null;

  it("offers both Policy sections, in the manual's order, with their pages", () => {
    expect(choices("on 10-20-26 she was scrolling social media on her phone on the sales floor")).toEqual([
      ["Cell Phone/Smart Watch Policy", 19],
      ["Social Media Policy", 22],
    ]);
    expect(describedManualSection({ text: "she was scrolling social media on her phone", chunks: MANUAL })).toBeNull();
  });

  it.each([
    /* One section answers: it is described, not offered. */
    "she was on her cell phone for an hour",
    /* One Policy section and a heading that is not one: the existing rule, nothing. */
    "she wore a belt that holds her cell phone",
    /* A policy named settles it. */
    "violated the cell phone policy, she was scrolling social media on her phone",
    /* Nothing described. */
    "she was rude to a guest",
    /* A question describes nothing. */
    "was she on social media on her phone?",
  ])("%s → no choice to offer", (text) => {
    expect(choices(text)).toBeNull();
  });
});

/* Review, 22 Oct 2026: a sentence about a policy is not its name. */
describe("a sentence about a policy names none", () => {
  it.each([["She knows the policy."], ["She was reminded of the policy."], ["She signed the policy."]])("%s", (text) => {
    expect(namedPolicies(text)).toEqual([]);
  });
  it("and the described Cell Phone/Smart Watch Policy is still found beside one", () => {
    const MANUAL: ManualChunk[] = [sheet(30, "Standards of Conduct", 12), sheet(43, "Cell Phone/Smart Watch Policy", 19)];
    expect(
      describedManualSection({ text: "on 10-20-26 she was on her cell phone on the floor. She knows the policy.", chunks: MANUAL })?.section.heading,
    ).toBe("Cell Phone/Smart Watch Policy");
  });
  it.each([["the cell phone policy", "cell phone"], ["social media policy.", "social media"]])('"%s" still names "%s"', (text, phrase) => {
    expect(namedPolicies(text).map((found) => found.phrase)).toContain(phrase);
  });
});
