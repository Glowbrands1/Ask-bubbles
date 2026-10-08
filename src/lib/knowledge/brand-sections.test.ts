import { describe, expect, it } from "vitest";

import { MULTI_BRAND_MANUAL_TITLES, POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import fixture from "@/test/fixtures/jba-manual-brand-chunks.json";

import { isMultiBrandManual, readManualForBrand } from "./brand-sections";

/**
 * The JBA manual's brand-specific passages, read as Buff City Soap. The
 * fixture is the manual's own text (see the fixture's note), so each
 * expectation below is about a real passage.
 */
const chunks = fixture.chunks.map((chunk) => ({ content: chunk.c, headings: chunk.h }));
const read = readManualForBrand(chunks, POLICY_MANUAL_BRAND_SCOPE);
const byIndex = new Map(fixture.chunks.map((chunk, position) => [chunk.i, read[position]!]));
const all = read.join("\n");

const OTHER_BRAND = /Sun Tan City|\bSTC\b|Crunch/;

describe("reading the JBA manual as Buff City Soap", () => {
  it("names the multi-brand manual by its titles, in either form", () => {
    expect(isMultiBrandManual("JBA Policy Manual Edited 5.2025", MULTI_BRAND_MANUAL_TITLES)).toBe(true);
    expect(isMultiBrandManual("2025 JBA Policy Manual - Edited 5-2025", MULTI_BRAND_MANUAL_TITLES)).toBe(true);
    expect(isMultiBrandManual("BCS Franchisee Social Media Policy", MULTI_BRAND_MANUAL_TITLES)).toBe(false);
  });

  it("keeps the company-wide dress code and the Buff City Soap block, drops the other brands' blocks", () => {
    expect(byIndex.get(35)).toContain("All Locations Dress Code:");
    expect(byIndex.get(35)).toContain("Name tags are to be worn and visible at all times while working.");
    expect(byIndex.get(36)).toContain("Tattoos");
    expect(byIndex.get(36)).not.toMatch(/Crunch|Two uniform shirts|Zumba/);
    // The other brand's block carries over into the next chunk's overlap, then Buff's label opens Buff's block.
    expect(byIndex.get(37)).not.toContain("Front Desk and Management’s pants");
    expect(byIndex.get(37)).toContain("Buff City Soap:");
    expect(byIndex.get(37)).toContain("Any BCS Employee can wear any plain black, white, or gray t-shirt");
    // Buff's block continues into chunk 38, then the tanning brand's block (and its "Tanning" sub-heading) is dropped.
    expect(byIndex.get(38)).toContain("Yoga pants, joggers or sweats are never to be worn while at work.");
    expect(byIndex.get(38)).not.toMatch(/Any STC Employee|consistent tanning schedule|ASD and above/);
    // The office block is company-wide and kept.
    expect(byIndex.get(38)).toContain("JB & Associates Office:");
    expect(byIndex.get(38)).toContain("Any JBA franchise Branded top");
    expect(byIndex.get(39)).toContain("All aspects of the dress code are at The Company’s discretion");
  });

  it("keeps Buff's IT support line and drops the other brands' contacts", () => {
    expect(byIndex.get(54)).toContain("Information Technology Support");
    expect(byIndex.get(54)).toContain("Phone: (833) 244-4848");
    expect(byIndex.get(54)).not.toMatch(/877|SunTanCity\.com/);
    expect(byIndex.get(55)).toContain("All other: HelpDesk@buffcitysoap.com");
    expect(byIndex.get(55)).not.toMatch(/abcfinancial|888-622-6290/);
    expect(byIndex.get(55)).toContain("Security Policy");
  });

  it("drops another brand's bullet and keeps the rest of the list and the section", () => {
    expect(byIndex.get(78)).toContain("A two (2) week notice is required for all full time and part-time Employees");
    expect(byIndex.get(78)).toContain("Buff City Soap – MyGlow");
    expect(byIndex.get(78)).not.toMatch(/Crunch Fitness – Woven/);
    expect(byIndex.get(78)).toContain("It is the responsibility of each employee to promptly notify The Company");
    expect(byIndex.get(91)).toContain("Buff City Soap – November 1 and December 31");
    expect(byIndex.get(91)).not.toMatch(/February 1 and June 1|January 1 and February 28/);
  });

  it("drops the wrapped rest of another brand's bullet, and keeps the next bullet whole", () => {
    // "o Sun Tan City: … and 25% off non-" wraps onto "tanning." — both lines are that bullet.
    const discounts = byIndex.get(93)!;
    expect(discounts.split("\n").map((line) => line.trim())).not.toContain("tanning.");
    expect(discounts).toContain("o Buff City Soap: 50% off products, 25% off bath bomb parties.");
    expect(discounts).toContain("The following is a list of what Employees are eligible for");
  });

  it("keeps the corporate office and Buff holiday lists, drops the other brands' lists across the chunk boundary", () => {
    expect(byIndex.get(92)).toContain("The Corporate Office is closed on the below listed holidays.");
    expect(byIndex.get(92)).not.toMatch(/is closed on the below listed holidays\. These holidays are paid holidays for salaried\nmanagers/);
    expect(byIndex.get(93)).not.toContain("The salons will be open on Memorial Day.");
    expect(byIndex.get(93)).not.toContain("Crunch Fitness is closed");
    expect(byIndex.get(93)).toContain("Buff City Soap is closed on the below listed holidays.");
    expect(byIndex.get(93)).toContain("hourly Employees will be paid 1.5 times their regular wage");
    expect(byIndex.get(93)).toContain("Employee Discounts for Company Products and Services");
    expect(byIndex.get(93)).toContain("Buff City Soap: 50% off products, 25% off bath bomb parties.");
    expect(byIndex.get(93)).not.toMatch(/Unlimited all access tanning|all access gym membership/);
  });

  it("drops the employee tanning privileges and the Buddy Passes section, and resumes at Employee Insurance Benefits", () => {
    expect(byIndex.get(94)).toContain("Buff City Soap: 50% off products");
    expect(byIndex.get(94)).not.toMatch(/tanning in moderation|paying clients come first/);
    expect(byIndex.get(95)).toBe("");
    expect(byIndex.get(96)).not.toContain("Buddy Passes");
    expect(byIndex.get(96)).toContain("Employee Insurance Benefits");
    expect(byIndex.get(96)).toContain("60 consecutive days of service in a full-time position");
  });

  it("drops the whole client tanning chapter and resumes at the Employee Acknowledgement", () => {
    expect(byIndex.get(104)).toContain("Maternity Leave");
    expect(byIndex.get(105)).toContain("The Leave Request Form provides documentation for any leave taken");
    expect(byIndex.get(105)).not.toMatch(/Client Tanning|overexposure|VersaSpa/);
    expect(byIndex.get(106)).toBe("");
    expect(byIndex.get(107)).toBe("");
    expect(byIndex.get(108)).not.toMatch(/One Tanner|tanning room/);
    expect(byIndex.get(108)).toContain("Employee Acknowledgement");
  });

  it("leaves no other brand's rule anywhere, while company-wide mentions of the brands may remain", () => {
    for (const line of all.split("\n")) {
      if (!OTHER_BRAND.test(line)) continue;
      // The only survivor is the company-wide sentence that lists every brand's employees.
      expect(line).toMatch(/hired through Sun Tan|City, Crunch Fitness, and Buff City Soap|Group Fitness/);
    }
  });

  it("is verbatim: every kept line appears in the manual's text", () => {
    const source = fixture.chunks.map((chunk) => chunk.c.replace(/\s+/g, " ")).join(" ");
    for (const line of all.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) expect(source).toContain(trimmed.replace(/\s+/g, " "));
    }
  });
});

describe("headings as today's extractor records them", () => {
  /*
   * The reference index recorded the dress code's item headings ("Shirts",
   * "Pants") as plain lines; the current PDF extractor records them as
   * section headings. A brand block must still run through its own items.
   */
  const ITEM = /^(?:Shirts|Pants)$/;
  const recorded = fixture.chunks.map((entry) => ({
    content: entry.c,
    headings: [...entry.h, ...entry.c.split("\n").map((line) => line.trim()).filter((line) => ITEM.test(line))],
  }));
  const reread = new Map(fixture.chunks.map((entry, position) => [entry.i, readManualForBrand(recorded, POLICY_MANUAL_BRAND_SCOPE)[position]!]));

  it("still drops Crunch's and Sun Tan City's shirt and pants rules, and keeps Buff City Soap's and the office's", () => {
    expect(recorded.some((entry) => entry.headings.includes("Shirts"))).toBe(true);
    expect(reread.get(36)).not.toMatch(/Two uniform shirts|Zumba|Instructors ONLY/);
    expect(reread.get(37)).toContain("Any BCS Employee can wear any plain black, white, or gray t-shirt");
    expect(reread.get(38)).toContain("Full length black or blue jean-colored pants are acceptable.");
    expect(reread.get(38)).not.toMatch(/Any STC Employee|ASD and above|consistent tanning schedule|Bermuda shorts or Capris\. Tanning/);
    expect(reread.get(38)).toContain("Any JBA franchise Branded top");
  });
});
