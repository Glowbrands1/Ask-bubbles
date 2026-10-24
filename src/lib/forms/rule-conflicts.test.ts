import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSystemPrompt } from "@/lib/ai/prompts";
import { flaggedCitationWrite, type FlaggedManualIdentity } from "@/lib/ai/policy-citation-fields";
import { actionPlanSentenceCount } from "@/lib/forms/action-plan-sentences";
import { correctiveActionPlan } from "@/lib/forms/ca-action-plan";
import {
  LATE_OPENING_OFFENSE,
  describedAttendanceKeys,
  describesLateOpening,
  readCaPolicy,
  statedOffenseKeys,
} from "@/lib/forms/ca-policy";
import { JOIN } from "@/lib/forms/bounded-context";
import { matchEmployeeName, type RosterEmployee } from "@/lib/forms/employee-match";
import { sectionHeadingsFor, type ManualChunk } from "@/lib/forms/official-policy-manual";
import { extractEmployeeNames, managerContext, resolveEmployee } from "@/lib/forms/proposal";
import { isNotAPersonCandidate, keepTypedPerson } from "@/lib/forms/typed-name";

/**
 * Rule conflicts from the 24 Oct 2026 prompt evidence.
 *
 * Re-asking a name the manager already gave is the failure these cover
 * first. The sentences below use that evidence's shape with synthetic
 * people. Nothing here opens a network connection or a database.
 */

const saved = {
  typed: process.env.TYPED_NAME_ENABLED,
  plan: process.env.ACTION_PLAN_SENTENCES_ENABLED,
};

afterEach(() => {
  restore("TYPED_NAME_ENABLED", saved.typed);
  restore("ACTION_PLAN_SENTENCES_ENABLED", saved.plan);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const PROMPT = {
  assistantName: "Bubbles",
  brandName: "Buff City Soap",
  productName: "Ask Bubbles",
  locationNoun: "store",
  context: { userName: "A Manager", locationName: "Omaha", todayIso: "2026-10-24" },
  mode: "standard" as const,
  hasContext: false,
};

describe("a name already given is not asked again", () => {
  const EVIDENCE = "write a verbal CA for Team Member TT at Dodge, NE. JBA Manual 1-1-25";

  it("drops a state code and the manual title, and keeps the typed name", () => {
    expect(isNotAPersonCandidate("NE")).toBe(true);
    expect(isNotAPersonCandidate("JBA Manual")).toBe(true);
    expect(isNotAPersonCandidate("TT")).toBe(false);
    expect(keepTypedPerson({ kind: "ambiguous", candidates: ["NE", "TT", "JBA Manual"] })).toEqual({
      kind: "resolved",
      employeeName: "TT",
    });
  });

  it("uses the name as typed and does not ask who it is for", () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const first = resolveEmployee(managerContext([], { content: EVIDENCE }));
    expect(first.kind, extractEmployeeNames(EVIDENCE).join(" | ")).toBe("resolved");
    if (first.kind !== "resolved") return;
    expect(first.employeeName).toMatch(/\bTT\b/);
    expect(first.employeeName.toLowerCase()).not.toContain("jba");

    const again = resolveEmployee(
      managerContext([{ id: "1", role: "user", content: EVIDENCE }], { content: "yes, verbal warning" }),
    );
    expect(again).toEqual(first);
  });

  it("still asks when two people were named", () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const resolution = resolveEmployee(
      managerContext([], { content: "write a verbal CA for Test Employee and Testy Testerson at Dodge, NE" }),
    );
    expect(resolution.kind).toBe("ambiguous");
    if (resolution.kind !== "ambiguous") return;
    expect(resolution.candidates.join(" ")).not.toMatch(/\bNE\b/);
  });

  it("leaves the existing ask in place when the flag is off", () => {
    delete process.env.TYPED_NAME_ENABLED;
    const prompt = buildSystemPrompt(PROMPT);
    expect(prompt).toContain("ask for their full name");
    expect(prompt).not.toContain("Use it exactly as typed");
  });

  it("the prompt no longer tells the model to ask for a name that was typed", () => {
    const prompt = buildSystemPrompt({ ...PROMPT, typedName: true });
    expect(prompt).toContain("Use it exactly as typed");
    expect(prompt).toContain("Do not ask for their full name again");
    expect(prompt).not.toContain("say so and ask for their full name");
    expect(prompt).toContain('do not ask "did you mean"');
  });

  it("a close roster match does not ask Did you mean", () => {
    const roster = [{ id: "1", firstName: "Kaitlyn", lastName: "Brook", locationIds: [] }] as unknown as RosterEmployee[];
    delete process.env.TYPED_NAME_ENABLED;
    expect(matchEmployeeName("Katlin Brook", roster).kind).toBe("confirm");
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    expect(matchEmployeeName("Katlin Brook", roster).kind).toBe("unchecked");
    expect(matchEmployeeName("Test Employee", roster).kind).toBe("none");
  });
});

describe("a store opening late is Late Opening, and an employee arriving late is Attendance", () => {
  it("opening the store late is not Tardiness", () => {
    const text = "create verbal ca for Test Employee for opening store late on 10-1-26";
    expect(describesLateOpening(text)).toBe(true);
    expect(describedAttendanceKeys(text)).toEqual([LATE_OPENING_OFFENSE]);
    expect(sectionHeadingsFor({ offenseKeys: [LATE_OPENING_OFFENSE], notes: text }).flat()).toEqual(["Late Opening"]);
    const named = [text, "attendance"].join(JOIN);
    expect(statedOffenseKeys(readCaPolicy(named), named)).toEqual([LATE_OPENING_OFFENSE]);
  });

  it("an employee who arrived late is Attendance, via the Tardiness box", () => {
    const text = "Test Employee arrived 20 minutes late for her shift";
    expect(describesLateOpening(text)).toBe(false);
    expect(describedAttendanceKeys(text)).toEqual(["tardiness"]);
    expect(sectionHeadingsFor({ offenseKeys: ["tardiness"], notes: text }).flat()).toContain("Attendance");
    expect(sectionHeadingsFor({ offenseKeys: ["tardiness"], notes: text }).flat()).not.toContain("Late Opening");
    const named = [text, "attendance"].join(JOIN);
    expect(statedOffenseKeys(readCaPolicy(named), named)).toEqual(["tardiness"]);
  });

  it("opening tasks left undone are not a late opening", () => {
    const text = "She came in late and didn't finish her opening tasks.";
    expect(describesLateOpening(text)).toBe(false);
    expect(readCaPolicy(text).ambiguous).toEqual(["standards_of_conduct", "attendance"]);
  });
});

describe("policy acknowledgements and leggings", () => {
  it("a policy acknowledgement that was not completed is Standards of Conduct", () => {
    const reading = readCaPolicy("she failed to acknowledge the policies in Woven by the 10-15 deadline");
    expect(reading.topics).toContain("acknowledgement");
    expect(reading.suggestion).toBe("standards_of_conduct");
    expect(readCaPolicy("previous coaching: policy acknowledgement 1-1-26").topics).not.toContain("acknowledgement");
  });

  it("leggings are Dress Code, and slippers are not guessed", () => {
    expect(readCaPolicy("she wore leggings on her shift").stated).toBe("dress_code");
    expect(readCaPolicy("She wore slippers on shift today.").stated).toBeNull();
    expect(readCaPolicy("She wore slippers on shift today.").suggestion).toBeNull();
  });
});

describe("the action plan stays two sentences when payroll deduct is yes", () => {
  const input = {
    citedPolicies: ["Late Opening"],
    employeeName: "Test Employee",
    payroll: { answer: "yes" as const, amount: "$25" },
  };

  it("the flag off keeps the deduction sentence", () => {
    delete process.env.ACTION_PLAN_SENTENCES_ENABLED;
    expect(actionPlanSentenceCount(correctiveActionPlan(input))).toBe(3);
  });

  it("the flag on does not add a third sentence", () => {
    vi.stubEnv("ACTION_PLAN_SENTENCES_ENABLED", "1");
    const plan = correctiveActionPlan(input);
    expect(actionPlanSentenceCount(plan)).toBe(2);
    expect(plan).not.toMatch(/deducted/);
    expect(plan.startsWith("Management will review the Late Opening policy with Test.")).toBe(true);
  });
});

describe("every form that has a policy line cites the name and the page", () => {
  const manual: FlaggedManualIdentity = {
    documentId: "doc-jba",
    documentTitle: "JBA Policy Manual",
    matchedBy: "fallback",
  };
  const late: ManualChunk = {
    chunkIndex: 34,
    page: 16,
    printedPage: 15,
    section: "Late Opening",
    sections: [{ heading: "Late Opening", page: 15 }],
    content: "Late Opening\nA location that opens late.",
  };
  const noPage: ManualChunk = {
    ...late,
    page: 0,
    printedPage: 0,
    sections: [{ heading: "Late Opening", page: 0 }],
    content: "Late Opening\nNo page is printed on this chunk.",
  };

  it("writes the section and the page, and appends them when the line was filled without one", () => {
    const written = flaggedCitationWrite({
      enabled: true,
      templateKey: "dpoa",
      values: { policy_language: "" },
      notes: "opening store late on 10-1-26",
      chunks: [late],
      manual,
    });
    expect(written.values.policy_language).toContain("Late Opening");
    expect(written.values.policy_language).toContain("p.15");

    const appended = flaggedCitationWrite({
      enabled: true,
      templateKey: "dpoa",
      values: { policy_language: "The store opened late." },
      notes: "opening store late on 10-1-26",
      chunks: [late],
      manual,
    });
    expect(appended.values.policy_language).toContain("The store opened late.");
    expect(appended.values.policy_language).toContain("Late Opening");
    expect(appended.values.policy_language).toContain("p.15");
  });

  it("does not invent a page the chunk does not have", () => {
    const written = flaggedCitationWrite({
      enabled: true,
      templateKey: "dpoa",
      values: { policy_language: "" },
      notes: "opening store late",
      chunks: [noPage],
      manual,
    });
    expect(written.values.policy_language ?? "").toBe("");
  });

  it("a form with no policy line is left alone", () => {
    const written = flaggedCitationWrite({
      enabled: true,
      templateKey: "resignation-exit",
      values: { details: "Last day 10-17." },
      notes: "opening store late",
      chunks: [late],
      manual,
    });
    expect(written.values).toEqual({ details: "Last day 10-17." });
  });

  it("the prompt requires the citation only when that flag is set", () => {
    expect(buildSystemPrompt(PROMPT)).not.toContain("Every form cites the policy");
    expect(buildSystemPrompt({ ...PROMPT, policyCitation: true })).toContain("Never invent a page");
  });
});
