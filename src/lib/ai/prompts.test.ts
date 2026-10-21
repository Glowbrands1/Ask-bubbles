import { describe, expect, it } from "vitest";

import {
  buildGroundingBlock,
  buildReportsGuideSection,
  buildSystemPrompt,
  extractUsedMarkers,
  stripMarkers,
  type GroundingChunk,
} from "./prompts";

const CONTEXT = {
  userName: "Dana Reyes",
  locationName: "Testville Downtown",
  todayIso: "2026-08-29",
};

function chunk(marker: number, title: string): GroundingChunk {
  return {
    marker,
    documentTitle: title,
    locator: `Page ${marker}`,
    content: `Excerpt ${marker}.`,
  };
}

describe("buildSystemPrompt", () => {
  it("names the assistant, the manager and the location", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
    });

    expect(prompt).toContain("You are Bubbles");
    expect(prompt).toContain("Dana Reyes");
    expect(prompt).toContain("Testville Downtown");
    expect(prompt).toContain("2026-08-29");
  });

  it("forbids fabricating policy, documents and citations", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
    });

    expect(prompt).toMatch(/Never invent a document title, a page number/i);
    expect(prompt).toMatch(/Never use a marker for a source that is not listed/i);
    expect(prompt).toMatch(/Never claim you have read, checked, searched/i);
    expect(prompt).toMatch(/knowledge base does not have it/i);
  });

  it("requires company knowledge and general guidance to be distinguished", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
    });

    expect(prompt).toContain("Company knowledge");
    expect(prompt).toContain("General guidance");
  });

  it("states outright that there is no company knowledge when nothing was retrieved", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: false,
    });

    expect(prompt).toMatch(/no company documents matched this question/i);
    expect(prompt).toMatch(/You have NO company knowledge/);
  });

  /*
   * THE REPORT DATA FLAG. Two grounding kinds share this prompt, and the
   * failure each of these guards is specific: a source marker attached to a
   * report figure, or a sales figure asserted from training data when no
   * report is attached.
   */
  it("adds a third statement kind when report figures are attached", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
      hasReportData: true,
    });

    expect(prompt).toContain("three kinds of statement");
    expect(prompt).toContain("3. Report figures");
    expect(prompt).toContain("Never mark them with a source marker");
    expect(prompt).toContain("name the report and reporting period the figure belongs to");
  });

  it("forbids inventing a report figure when report figures ARE attached", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
      hasReportData: true,
    });

    expect(prompt).toContain("not written in the REPORT DATA section");
    expect(prompt).toContain("never compute a new one from it");
  });

  it("forbids stating any report figure at all when none is attached", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
    });

    expect(prompt).toContain("You have NO report figures for this question");
    expect(prompt).toContain("Do not state a sales figure");
    expect(prompt).toContain("a rate or a comparison from memory");
    expect(prompt).toContain("two kinds of statement");
    expect(prompt).not.toContain("3. Report figures");
  });

  it("defaults to having no report figures", () => {
    // An older caller that has not been updated must get the RESTRICTIVE
    // branch, not the permissive one.
    const withoutFlag = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
    });
    const explicitlyFalse = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
      hasReportData: false,
    });

    expect(withoutFlag).toBe(explicitlyFalse);
  });

  it("keeps the two grounding kinds independent", () => {
    // Report figures with no matching documents is the commonest reporting
    // question: both notices must appear, and neither may replace the other.
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "location",
      context: CONTEXT,
      mode: "standard",
      hasContext: false,
      hasReportData: true,
    });

    expect(prompt).toContain("no company documents matched this question");
    expect(prompt).toContain("3. Report figures");
  });

  it("varies the length instruction by answer mode", () => {
    const build = (mode: "quick" | "standard" | "detailed") =>
      buildSystemPrompt({
        assistantName: "Bubbles",
        brandName: "Buff City Soap",
        productName: "Ask Bubbles",
        locationNoun: "location",
        context: CONTEXT,
        mode,
        hasContext: true,
      });

    expect(build("quick")).toContain("two or three sentences");
    expect(build("detailed")).toContain("full picture");
    expect(build("quick")).not.toBe(build("detailed"));
  });
});

describe("buildGroundingBlock", () => {
  it("labels each excerpt with its real title and locator", () => {
    const block = buildGroundingBlock([chunk(1, "Attendance Policy")]);
    expect(block).toContain("[S1] Attendance Policy — Page 1");
    expect(block).toContain("Excerpt 1.");
  });

  it("enumerates exactly which markers are valid", () => {
    const block = buildGroundingBlock([chunk(1, "A"), chunk(2, "B")]);
    expect(block).toContain("Valid markers are [S1], [S2].");
  });

  it("says plainly when nothing matched", () => {
    expect(buildGroundingBlock([])).toContain("No company documents matched");
  });
});

/**
 * Ported from the reference platform: asked "where do i find kpi information",
 * its assistant listed outside systems from the knowledge base and never
 * mentioned the app's own reports, because nothing told it they exist.
 */
describe("the Reports guide", () => {
  const REPORTS = [
    { id: "store-sales", label: "Store Sales", summary: "Fixture: daily sales by store." },
    { id: "guest-count", label: "Guest Count", summary: "Fixture: guests through the door." },
  ];

  it("names the section and links every report for a role that can open it", () => {
    const section = buildReportsGuideSection({
      reports: REPORTS,
      canViewReports: true,
      locationNoun: "store",
    });

    expect(section).toContain("REPORTS — WHERE THE NUMBERS LIVE IN THIS APP");
    expect(section).toMatch(/where to find KPIs/i);
    expect(section).toContain("[Reports](/reports)");
    expect(section).toContain("[Store Sales](/reports/store-sales) — Fixture: daily sales by store.");
    expect(section).toContain("[Guest Count](/reports/guest-count)");
    expect(section).toContain("for example [Store Sales](/reports/store-sales)");
    expect(section).toContain("for the stores on their own assignment");
  });

  it("puts systems outside the app second and never reads a report it was not given", () => {
    const section = buildReportsGuideSection({ reports: REPORTS, canViewReports: true, locationNoun: "store" });

    expect(section).toMatch(/Systems outside this app come second/);
    expect(section).toMatch(/Never state a figure from a report unless it is written in the REPORT DATA section/);
  });

  it("does not send a role without view_reports there", () => {
    const section = buildReportsGuideSection({ reports: REPORTS, canViewReports: false, locationNoun: "store" });

    expect(section).toMatch(/cannot open the Reports section/);
    expect(section).toContain("Location Manager or District Manager");
    expect(section).not.toContain("/reports");
  });

  it("is absent when no report can be linked", () => {
    expect(buildReportsGuideSection({ reports: [], canViewReports: true, locationNoun: "store" })).toBeNull();
    expect(buildReportsGuideSection({ reports: [], canViewReports: false, locationNoun: "store" })).toBeNull();
  });

  it("leaves Buff City Soap's prompt unchanged while no live report is registered", () => {
    const base = {
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "store",
      context: CONTEXT,
      mode: "standard" as const,
      hasContext: true,
    };

    const withAccess = buildSystemPrompt({ ...base, canViewReports: true });
    expect(withAccess).toBe(buildSystemPrompt(base));
    expect(withAccess).not.toContain("WHERE THE NUMBERS LIVE");
    expect(withAccess).not.toContain("/reports");
  });
});

describe("extractUsedMarkers", () => {
  it("returns the markers used, in first-appearance order, deduplicated", () => {
    expect(extractUsedMarkers("Yes [S2]. Also [S1] and again [S2].", [1, 2, 3])).toEqual([
      2, 1,
    ]);
  });

  it("discards a marker the model invented", () => {
    // The model cannot conjure a source card for a document that was never
    // retrieved: out-of-range markers are dropped, not resolved.
    expect(extractUsedMarkers("Policy says so [S9].", [1, 2])).toEqual([]);
  });

  it("returns nothing when the answer cites nothing", () => {
    expect(extractUsedMarkers("I do not have that in the knowledge base.", [1])).toEqual([]);
  });
});

describe("stripMarkers", () => {
  it("removes markers from the displayed prose", () => {
    expect(stripMarkers("Be on time [S1]. Wear the badge [S2].")).toBe(
      "Be on time. Wear the badge.",
    );
  });

  it("removes an invalid marker too, so nothing dangles in the UI", () => {
    expect(stripMarkers("Something [S9].")).toBe("Something.");
  });

  it("leaves ordinary bracketed text alone", () => {
    expect(stripMarkers("See the guide [section 4] for detail.")).toBe(
      "See the guide [section 4] for detail.",
    );
  });
});

describe("an answer given while a form is open in the conversation", () => {
  const base = {
    assistantName: "Bubbles",
    brandName: "Buff City Soap",
    productName: "Ask Bubbles",
    locationNoun: "store",
    context: CONTEXT,
    mode: "standard" as const,
    hasContext: true,
  };
  const openForm = {
    templateName: "Corrective Action Form",
    employeeName: "Pat Rivera",
    status: "draft" as const,
    lines: [{ label: "Type of Warning", value: "Verbal Warning" }],
    unverifiedPolicy: ["Direct policy from official manual"],
  };

  it("names the form and never tells the manager it does not exist", () => {
    const prompt = buildSystemPrompt({ ...base, openForm });
    expect(prompt).toContain("A FORM IS OPEN IN THIS CONVERSATION: the Corrective Action Form for Pat Rivera");
    expect(prompt).toContain('Type of Warning: "Verbal Warning"');
    expect(prompt).toContain("Not yet checked against the official manual: Direct policy from official manual.");
    expect(prompt).toMatch(/NEVER say no form has been created/);
    expect(prompt).toMatch(/add the attendance policy/);
    expect(prompt).toMatch(/Ask Bubbles quotes it onto the form word for word/);
    expect(prompt).not.toMatch(/say the form has not been created yet/);
  });

  it("points a finalized form to a revision, not to an edit", () => {
    const prompt = buildSystemPrompt({ ...base, openForm: { ...openForm, status: "finalized", unverifiedPolicy: [] } });
    expect(prompt).toContain("It is finalized: a change needs a revision, opened from Forms → Forms Register.");
    expect(prompt).not.toMatch(/CHANGES TO THIS FORM ARE MADE IN THIS CONVERSATION/);
  });

  it("keeps the old rule when no form is open", () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toMatch(/say the form has not been created yet/);
    expect(prompt).not.toContain("A FORM IS OPEN");
  });
});
