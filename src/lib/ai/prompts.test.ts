import { describe, expect, it } from "vitest";

import {
  ACTION_PLAN_SENTENCE_RULE,
  COACHING_CONSEQUENCE_RULES,
  EMPLOYEE_FIGURE_RULES,
  FORM_LIBRARY_DETAIL_RULES,
  PRINTED_PAGE_RULE,
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

  /*
   * FORMS ON FILE. Every block attached at once is SEVEN kinds of statement —
   * the number word the taxonomy had no entry for before the Forms Register
   * lookup was added.
   */
  it("counts the forms on file as a seventh kind, with rules that keep the answer to the record", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "store",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
      hasReportData: true,
      hasFormsLibrary: true,
      hasVerifiedRecords: true,
      hasPersonMemory: true,
      hasFormRecords: true,
    });

    expect(prompt).toContain("seven kinds of statement");
    expect(prompt).toContain("7. Forms on file");
    expect(prompt).toContain("FORMS ALREADY ON FILE");
    expect(prompt).toContain("never say you cannot look it up");
    expect(prompt).toContain("The section covers only the stores it names.");
    expect(prompt).toContain("or the FORMS ON FILE section lists it");
    expect(prompt).not.toMatch(/salon|Form Monitoring/i);
  });

  it("adds nothing about forms on file without the block", () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "store",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
      hasPersonMemory: true,
    });

    expect(prompt).not.toContain("FORMS ALREADY ON FILE");
    expect(prompt).not.toContain("FORMS ON FILE");
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

  it("points a finalized form to a new draft of it, never to an edit of the original", () => {
    const prompt = buildSystemPrompt({ ...base, openForm: { ...openForm, status: "finalized", unverifiedPolicy: [] } });
    expect(prompt).toContain("It is finalized: a change is made on a new draft of it");
    expect(prompt).toContain("pressing Edit as new draft on the card");
    expect(prompt).not.toMatch(/CHANGES TO THIS FORM ARE MADE IN THIS CONVERSATION/);
  });

  it("never lets the model say a created form cannot be changed", () => {
    const prompt = buildSystemPrompt({ ...base, hasFormsLibrary: true });
    expect(prompt).toContain("A form already created CAN be changed, here in the conversation");
    expect(prompt).toContain("Never say a created or finalized form cannot be edited, copied or drafted again.");
  });

  it("keeps the old rule when no form is open", () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toMatch(/say the form has not been created yet/);
    expect(prompt).not.toContain("A FORM IS OPEN");
  });
});

describe("Sunny chat and forms rules stay behind the existing flags", () => {
  const base = {
    assistantName: "Bubbles",
    brandName: "Buff City Soap",
    productName: "Ask Bubbles",
    locationNoun: "store",
    context: CONTEXT,
    mode: "standard" as const,
    hasContext: true,
    hasFormsLibrary: true,
    hasPersonMemory: true,
    hasFormRecords: true,
  };

  it("leaves the prompt unchanged when the flags are omitted", () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toBe(
      buildSystemPrompt({
        ...base,
        styleRules: false,
        actionPlanSentences: false,
        printedPageOnly: false,
        typedName: false,
        policyCitation: false,
      }),
    );
    expect(prompt).toContain("ask for their full name");
    expect(prompt).toContain("A metric is a coaching signal, not a finding.");
    expect(prompt).toContain("TRAINING MATERIAL IS NOT A FORM");
    expect(prompt).toContain("Keep what the person told you at the standing they gave it.");
    expect(prompt).toContain("edit the exit form for Jordan Smith");
    expect(prompt).toContain("ask whether that is the person they mean before treating it as theirs.");
    expect(prompt).toContain("ask before relying on it.");
    expect(prompt).not.toContain(COACHING_CONSEQUENCE_RULES);
    expect(prompt).not.toContain(EMPLOYEE_FIGURE_RULES);
    expect(prompt).not.toContain(FORM_LIBRARY_DETAIL_RULES);
    expect(prompt).not.toContain(ACTION_PLAN_SENTENCE_RULE);
    expect(prompt).not.toContain(PRINTED_PAGE_RULE);
    expect(prompt).not.toContain("salon");
    expect(prompt).not.toContain("tanning");
    expect(prompt).not.toContain("PPTA");
  });

  it("adds the consequence rules, the missing forms sentences, and the two-sentence plan only when those flags are on", () => {
    const prompt = buildSystemPrompt({
      ...base,
      styleRules: true,
      actionPlanSentences: true,
      printedPageOnly: true,
      typedName: true,
    });
    expect(prompt).toContain(COACHING_CONSEQUENCE_RULES);
    expect(prompt).toContain("Weigh opportunity volume before performance.");
    expect(prompt).toContain("Recommend the lightest appropriate next step.");
    expect(prompt).toContain("Recognition is half the job.");
    expect(prompt).toContain(EMPLOYEE_FIGURE_RULES);
    expect(prompt).toContain("Do not invent an employee, a name, a score, a ranking or a headcount.");
    expect(prompt).toContain(FORM_LIBRARY_DETAIL_RULES);
    expect(prompt).toContain(
      "An approved progression may name a step — observation, role play, a follow-up review, escalation to leadership — that has no template of its own.",
    );
    expect(prompt).toContain(
      "Guidance about how to coach, when to escalate and what the progression is lives in the knowledge base and is cited by marker.",
    );
    expect(prompt).toContain(ACTION_PLAN_SENTENCE_RULE);
    expect(prompt).toContain("An action plan on a form is exactly two sentences.");
    expect(prompt).toContain(PRINTED_PAGE_RULE);
    expect(prompt).toContain("A PDF sheet number is not the printed page.");
    expect(prompt).toContain("Use the name the manager typed. Do not ask which person, and do not block because a roster does not list them.");
    expect(prompt).toContain("keep the name the manager typed. Do not ask whether that is the person, and do not block the form.");
    expect(prompt).not.toContain("ask whether that is the person they mean");
    expect(prompt).not.toContain("ask before relying on it.");
    expect(prompt).not.toContain("I couldn't find");
    expect(prompt).not.toContain("salon");
  });
});
