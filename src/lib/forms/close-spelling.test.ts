import { afterEach, describe, expect, it, vi } from "vitest";

import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";

import { closeWordDistance, editDistance } from "./close-spelling";
import { closeHeadingReading, closePolicyQuestion, manualSectionNamedBy } from "./named-policy-section";
import { manualSheetHeadings } from "./official-policy-manual";

/*
 * CLOSE_SPELLING_MATCH (Pau via QA, 13 Nov 2026): "Allow close spellings ("Care and Clening" → "Care and Cleaning").
 * Put the list's correct spelling on the form. Ask "Did you mean …?" when there is more than one possible match, or
 * when the match isn't confident."
 */
const HEADINGS = manualSheetHeadings(JBA_MANUAL_CA_CHUNKS);

afterEach(() => vi.unstubAllEnvs());

describe("close-spelling: the distance between two words", () => {
  it("counts one change, insert, delete or swap as one", () => {
    expect(editDistance("clening", "cleaning")).toBe(1);
    expect(editDistance("phnoe", "phone")).toBe(1);
    expect(editDistance("wrkplace", "workplace")).toBe(1);
    expect(editDistance("cleaning", "cleaning")).toBe(0);
  });

  it("reads a short word as no other word", () => {
    expect(closeWordDistance("dres", "dress")).toBeNull();
    expect(closeWordDistance("cash", "cast")).toBeNull();
    expect(closeWordDistance("clening", "cleaning")).toBe(1);
    expect(closeWordDistance("retalation", "retaliation")).toBe(1);
    expect(closeWordDistance("retalaton", "retaliation")).toBe(2);
    expect(closeWordDistance("visotrs", "visitors")).toBeNull();
    expect(closeWordDistance("vistrs", "visitors")).toBeNull();
  });
});

describe("close-spelling: a policy named a letter off", () => {
  it("flag off: only the exact spelling names a heading (as on main)", () => {
    expect(manualSectionNamedBy("care and clening", JBA_MANUAL_CA_CHUNKS)).toBeNull();
    expect(manualSectionNamedBy("anmals in the workplace", JBA_MANUAL_CA_CHUNKS)).toBeNull();
    expect(closePolicyQuestion("anmals in the wrkplace", JBA_MANUAL_CA_CHUNKS)).toBeNull();
  });

  it("flag on: one word one letter off names the one heading, cited in the manual's spelling", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(manualSectionNamedBy("care and clening", JBA_MANUAL_CA_CHUNKS)?.heading).toBe("Care and Cleaning of Equipment and Facilities");
    expect(manualSectionNamedBy("anmals in the workplace", JBA_MANUAL_CA_CHUNKS)?.heading).toBe("Animals in the Workplace");
    expect(manualSectionNamedBy("vistors at work", JBA_MANUAL_CA_CHUNKS)?.heading).toBe("Visitors in the Workplace");
    expect(manualSectionNamedBy("smokng", JBA_MANUAL_CA_CHUNKS)?.heading).toBe("Smoking/Vaping");
  });

  it("flag on: a heading named as spelled is matched exactly as before", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(manualSectionNamedBy("visitors at work", JBA_MANUAL_CA_CHUNKS)?.heading).toBe("Visitors in the Workplace");
    expect(closePolicyQuestion("visitors at work", JBA_MANUAL_CA_CHUNKS)).toBeNull();
  });

  it("flag on: two words off is not confident — nothing is cited, the manager is asked", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(manualSectionNamedBy("anmals in the wrkplace", JBA_MANUAL_CA_CHUNKS)).toBeNull();
    expect(closeHeadingReading("anmals in the wrkplace", HEADINGS)).toEqual({ confident: null, candidates: ["Animals in the Workplace"] });
    expect(closePolicyQuestion("anmals in the wrkplace", JBA_MANUAL_CA_CHUNKS)).toMatch(
      /^\*\*Policy:\*\* I don't see a section of the policy manual called "anmals in the wrkplace"\. Did you mean \*\*Animals in the Workplace\*\* \(page \d+\)\?/,
    );
  });

  it("flag on: two headings close is not confident — both are offered, none is cited", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    const headings = ["Visitors in the Workplace", "Visiting Hours"];
    expect(closeHeadingReading("visitng", headings).confident).toBeNull();
    const reading = closeHeadingReading("visitrs", ["Visitors", "Visiters"]);
    expect(reading).toEqual({ confident: null, candidates: ["Visitors", "Visiters"] });
  });

  it("flag on: words no heading is close to name nothing and ask nothing", () => {
    vi.stubEnv("CLOSE_SPELLING_MATCH_ENABLED", "true");
    expect(manualSectionNamedBy("parking lot", JBA_MANUAL_CA_CHUNKS)).toBeNull();
    expect(closePolicyQuestion("parking lot", JBA_MANUAL_CA_CHUNKS)).toBeNull();
  });
});
