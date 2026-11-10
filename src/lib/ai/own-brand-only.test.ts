import { afterEach, describe, expect, it, vi } from "vitest";

import { BCS_BRAND } from "@/config/company/brand";
import { POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";

import { ownBrandOnly, withOwnBrandOnly } from "./own-brand-only";
import type { AskResponse } from "./types";

/*
 * OWN_BRAND_ONLY_ENABLED (Pau, 6 Nov 2026). The other brands are never written in this app's code or tests: they are
 * read from the config's patterns ("A\s+B\s+C" → "A B C", an optional part left off), as the manual reader reads them.
 */
const nameOf = (source: string) => source.replace(/\(\?:[^)]*\)\?/g, "").replace(/\\s\+/g, " ");
const OWN = BCS_BRAND.brandName;
const OTHERS = POLICY_MANUAL_BRAND_SCOPE.otherBrands.map(nameOf).filter((name) => name.length > 3);
const [FIRST, SECOND] = [OTHERS.find((name) => name.split(" ").length === 1)!, OTHERS.find((name) => name.split(" ").length > 1)!];

/* The live reply's sentence (QA, relayed from Pau, 6 Nov 2026), with the other brands as the config names them. */
const LIVE = `This applies company-wide across all brands — ${OWN}, ${FIRST}, ${SECOND} — pets are not allowed in the workplace [p.29].`;

const reply = (content: string): AskResponse => ({ content }) as AskResponse;

afterEach(() => vi.unstubAllEnvs());

describe("OWN_BRAND_ONLY_ENABLED", () => {
  it("the config names two other brands (the test's own guard)", () => {
    expect(FIRST).toBeTruthy();
    expect(SECOND).toBeTruthy();
  });

  it("off: the reply is as built (the live sentence, byte for byte)", () => {
    const live = reply(LIVE);
    expect(withOwnBrandOnly(live)).toBe(live);
  });

  it("on: the live sentence names only this brand", () => {
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    const content = withOwnBrandOnly(reply(LIVE)).content;
    expect(content).toBe(`This applies company-wide at ${OWN} — pets are not allowed in the workplace [p.29].`);
    for (const other of OTHERS) expect(content).not.toContain(other);
  });

  it("on: a reply naming no other brand is unchanged", () => {
    vi.stubEnv("OWN_BRAND_ONLY_ENABLED", "true");
    const plain = reply(`Pets are not allowed in the workplace at ${OWN} [p.29]. "Animals are not permitted on the premises." Ask your manager about service animals.`);
    expect(withOwnBrandOnly(plain)).toBe(plain);
  });

  it("on: another brand's heading and its bullets go; this brand's stay", () => {
    const text = [
      "Holiday pay depends on the brand:",
      "",
      `- **${SECOND}** — paid holidays are New Year's Day and Easter.`,
      `- **${FIRST}** — paid holidays are Thanksgiving and Christmas only.`,
      `- **${OWN}** — paid holidays are Independence Day, Thanksgiving, Christmas, New Year's Day, and Easter [p.43].`,
      "",
      `*${FIRST}*`,
      "- Shirts: two uniform shirts provided at hire [p.16].",
      "",
      `*${OWN}*`,
      "- Shirts: any plain black, white or gray t-shirt under the branded apron [p.16].",
    ].join("\n");
    const out = ownBrandOnly(text);
    for (const other of OTHERS) expect(out).not.toContain(other);
    expect(out).toContain(`- **${OWN}** — paid holidays are Independence Day`);
    expect(out).toContain(`*${OWN}*\n- Shirts: any plain black`);
    expect(out).not.toContain("two uniform shirts");
  });

  it("on: a quotation is never reworded — kept whole or dropped whole", () => {
    const quoted = `The manual says "Employees of ${OWN}, ${FIRST} and ${SECOND} must wear name tags." Name tags are required [p.15].`;
    expect(ownBrandOnly(quoted)).toBe("Name tags are required [p.15].");
  });
});
