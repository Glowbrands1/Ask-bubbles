import { describe, expect, it } from "vitest";

// A plain ES module script, used by the CLI and tested here.
import { prepareFramework } from "../../../scripts/knowledge/framework-debrand.mjs";

/**
 * The framework is prepared for Ask Bubbles by removing the source app's name
 * and NOTHING else. Synthetic text only.
 */
const SAMPLE = [
  "# ASK SUNNY PERFORMANCE MANAGEMENT FRAMEWORK",
  "This framework teaches Ask Sunny how to think when helping Sun Tan City leaders.",
  "Sunny should never replace DM, HR, LP, or senior leadership approval. Sunny's role is to draft.",
  "File: ASK_SUNNY_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt",
  "### 10.7 Final operating rule for Ask Sunny",
  "Recommend Spa Wellness and use the Routine Mat; low PPTA and Club Close % in the salon.",
].join("\n");

describe("preparing the framework", () => {
  const { text, report } = prepareFramework(SAMPLE);

  it("removes every form of the app's name", () => {
    expect(text).not.toMatch(/Sunny/);
    expect(text).toContain("# ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK");
    expect(text).toContain("This framework teaches Ask Bubbles how to think");
    expect(text).toContain("Bubbles should never replace DM, HR, LP, or senior leadership approval. Bubbles’ role is to draft.");
    expect(text).toContain("ASK_BUBBLES_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt");
    expect(text).toContain("### 10.7 Final operating rule for Ask Bubbles");
    expect(report.appNameLeft).toBe(0);
    expect(report.appNameChanges).toBe(6);
  });

  it("changes nothing else: undoing the app-name changes gives back the original exactly", () => {
    const undone = text
      .replace(/ASK BUBBLES/g, "ASK SUNNY")
      .replace(/ASK_BUBBLES/g, "ASK_SUNNY")
      .replace(/Ask Bubbles/g, "Ask Sunny")
      .replace(/Bubbles’/g, "Sunny's")
      .replace(/\bBubbles\b/g, "Sunny");
    expect(undone).toBe(SAMPLE);
    expect(report.linesAfter).toBe(report.linesBefore);
  });

  it("keeps the source company and its operational wording verbatim, and reports each for a decision", () => {
    expect(text).toContain("Sun Tan City leaders");
    expect(text).toContain("Recommend Spa Wellness and use the Routine Mat; low PPTA and Club Close % in the salon.");
    const flagged = Object.fromEntries(report.flags.map((flag: { id: string; count: number }) => [flag.id, flag.count]));
    expect(flagged).toMatchObject({ source_company: 1, spa: 1, salon: 1, sales_metrics: 2, service_terms: 1 });
    expect(report.companyContexts).toEqual([expect.objectContaining({ line: 2, context: expect.stringContaining("Sun Tan City leaders") })]);
  });
});
