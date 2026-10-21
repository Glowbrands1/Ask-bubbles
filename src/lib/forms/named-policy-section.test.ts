import { describe, expect, it } from "vitest";

import type { ManualChunk } from "./official-policy-manual";
import {
  describedPolicies,
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
 * District Manager feedback, 21 Oct 2026: the JBA manual's heading is "Cell
 * Phone/Smart Watch Policy", page 19 — one section, two names.
 */
describe("a heading with a slash", () => {
  it.each([
    ["cell phone", "Cell Phone/Smart Watch Policy"],
    ["smart watch", "Cell Phone/Smart Watch Policy"],
    ["cell phone and smart watch", "Cell Phone/Smart Watch Policy"],
    ["smoking", "Smoking/Vaping"],
    ["vaping", "Smoking/Vaping"],
    ["jewelry", "Jewelry/Accessories"],
  ])("%s → %s", (phrase, heading) => {
    expect(namesHeading(phrase, heading)).toBe(true);
  });

  it.each([
    ["phone", "Cell Phone/Smart Watch Policy"],
    ["watch", "Cell Phone/Smart Watch Policy"],
    ["cell phone", "Coupon Collection"],
    ["attendance", "Seminar/Webinar Attendance"],
    ["smoking", "Drug, Alcohol and Smoking Policy"],
  ])("%s is not %s", (phrase, heading) => {
    expect(namesHeading(phrase, heading)).toBe(false);
  });

  it("is found in the manual by either name, and only that section", () => {
    const manual = [
      ...CHUNKS.filter((chunk) => chunk.section !== "Cell Phone Usage"),
      sheet(61, "Cell Phone/Smart Watch Policy", 19),
      sheet(62, "Texting as General Work communications", 19),
    ];
    expect(manualSectionNamedBy("cell phone", manual)).toMatchObject({ heading: "Cell Phone/Smart Watch Policy", page: 19 });
    expect(manualSectionNamedBy("smart watch", manual)).toMatchObject({ heading: "Cell Phone/Smart Watch Policy", page: 19 });
  });
});

describe("describedPolicies — the employee's own phone or watch, in use", () => {
  it.each([
    "on 10-20-26 tess was talking on her cell phone for over 30 minutes",
    "she was on her phone at the register",
    "using his cell phone on the floor",
    "scrolling through her phone instead of greeting guests",
    "she was texting during her shift",
    "cell phone use on the sales floor",
  ])("%s → cell phone", (text) => {
    expect(describedPolicies(text).map((named) => named.phrase)).toEqual(["cell phone"]);
  });

  it("reads a smart watch as its own name for the same policy", () => {
    expect(describedPolicies("she kept answering calls on her smart watch").map((named) => named.phrase)).toEqual([
      "smart watch",
    ]);
  });

  it.each([
    "I called her phone twice and she never answered",
    "she hung up on a guest who called the store phone",
    "she was on the phone with a guest for 20 minutes",
    "was she on her phone?",
  ])("%s → nothing", (text) => {
    expect(describedPolicies(text)).toEqual([]);
  });

  it("is cited only when no named policy answers, and says it was described", () => {
    const manual = [...CHUNKS.filter((chunk) => chunk.section !== "Cell Phone Usage"), sheet(61, "Cell Phone/Smart Watch Policy", 19)];
    expect(namedManualSection({ text: "she was on her phone for 30 minutes", chunks: manual })).toMatchObject({
      phrase: "cell phone",
      described: true,
      section: { heading: "Cell Phone/Smart Watch Policy", page: 19 },
      offenseKey: "company_policies",
    });
    expect(
      namedManualSection({ text: "violating visitors at work policy. she was on her phone with a friend", chunks: manual }),
    ).toMatchObject({ described: false, section: { heading: "Visitors in the Workplace" } });
  });
});
