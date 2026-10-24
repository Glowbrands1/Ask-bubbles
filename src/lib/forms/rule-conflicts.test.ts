import { afterEach, describe, expect, it, vi } from "vitest";

import { applyGroundedProposal, type GroundedPerson, type GroundedPrep } from "@/lib/ai/grounded-entities";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { flaggedCitationWrite, printedPageFromRetrieval, type FlaggedManualIdentity } from "@/lib/ai/policy-citation-fields";
import { selfCheck } from "@/lib/ai/self-check";
import { actionPlanSentenceCount } from "@/lib/forms/action-plan-sentences";
import { correctiveActionPlan, planPayrollAmount } from "@/lib/forms/ca-action-plan";
import {
  LATE_OPENING_OFFENSE,
  describedAttendanceKeys,
  describesLateOpening,
  readCaPolicy,
  statedOffenseKeys,
} from "@/lib/forms/ca-policy";
import { JOIN } from "@/lib/forms/bounded-context";
import { matchEmployeeName, wovenCloseNote, type RosterEmployee } from "@/lib/forms/employee-match";
import { verifyEmployee } from "@/lib/forms/employee-verification";
import { readStoreMentions } from "@/lib/stores/resolver";
import { sectionHeadingsFor, type ManualChunk } from "@/lib/forms/official-policy-manual";
import { extractEmployeeNames, managerContext, resolveEmployee } from "@/lib/forms/proposal";
import { isTypedStopSpan } from "@/lib/forms/name-words";
import { companyNameStops } from "@/lib/forms/name-stops";
import { isNotAPersonCandidate, keepTypedPerson } from "@/lib/forms/typed-name";
import type { ChatFormProposal } from "@/types";

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
  printed: process.env.PRINTED_PAGE_ONLY_ENABLED,
};

afterEach(() => {
  restore("TYPED_NAME_ENABLED", saved.typed);
  restore("ACTION_PLAN_SENTENCES_ENABLED", saved.plan);
  restore("PRINTED_PAGE_ONLY_ENABLED", saved.printed);
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
    const close = matchEmployeeName("Katlin Brook", roster);
    expect(close.kind).toBe("unchecked");
    if (close.kind === "unchecked") expect(close.closeName).toBe("Kaitlyn Brook");
    expect(wovenCloseNote("Kaitlyn Brook")).toBe(
      "Woven has **Kaitlyn Brook** — say so if that's who you mean. Carry on; do not wait.",
    );
    expect(wovenCloseNote("Kaitlyn Brook").startsWith("Did you mean")).toBe(false);
    expect(matchEmployeeName("Test Employee", roster).kind).toBe("none");
  });

  it("two close people are still a question", () => {
    const roster = [
      { id: "1", firstName: "Kaitlyn", lastName: "Brook", locationIds: [] },
      { id: "2", firstName: "Kaitlyn", lastName: "Brooks", locationIds: [] },
    ] as unknown as RosterEmployee[];
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    expect(matchEmployeeName("Katlin Brook", roster).kind).toBe("confirm");
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

  it("the flag on does not fill $25 from the Late Opening section", () => {
    const quoted = "The employee will reimburse The Company $25.00 via payroll deduction.";
    delete process.env.ACTION_PLAN_SENTENCES_ENABLED;
    expect(planPayrollAmount({ answer: "yes", stated: null, quotedPolicy: quoted })).toEqual({
      amount: "$25.00",
      amountFrom: "manual",
    });
    vi.stubEnv("ACTION_PLAN_SENTENCES_ENABLED", "1");
    expect(planPayrollAmount({ answer: "yes", stated: null, quotedPolicy: quoted })).toEqual({ amount: null });
    expect(planPayrollAmount({ answer: "yes", stated: "$4.10", quotedPolicy: quoted })).toEqual({
      amount: "$4.10",
      amountFrom: "manager",
    });
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

describe("a citation uses the printed page, not the PDF page", () => {
  const late = {
    section: "Late Opening",
    page: 16,
    printedPage: 15,
    content: "15 | P a g e\nLate Opening\nA location that opens late.",
  };

  it("off, either page number is accepted", () => {
    delete process.env.PRINTED_PAGE_ONLY_ENABLED;
    expect(
      selfCheck({
        answer: "See Late Opening Policy, JBA Policy Manual p.16.",
        chunks: [late],
        roster: [],
      }),
    ).toEqual([]);
    expect(
      selfCheck({
        answer: "See Late Opening Policy, JBA Policy Manual p.15.",
        chunks: [{ section: "Late Opening", page: 15, content: "Late Opening" }],
        roster: [],
      }),
    ).toEqual([]);
  });

  it("on, only the printed page is accepted", () => {
    vi.stubEnv("PRINTED_PAGE_ONLY_ENABLED", "1");
    expect(
      selfCheck({
        answer: "See Late Opening Policy, JBA Policy Manual p.16.",
        chunks: [late],
        roster: [],
      }).map((failure) => failure.kind),
    ).toEqual(["citation"]);
    expect(
      selfCheck({
        answer: "See Late Opening Policy, JBA Policy Manual p.15.",
        chunks: [late],
        roster: [],
      }),
    ).toEqual([]);
    expect(
      selfCheck({
        answer: "See Late Opening Policy, JBA Policy Manual p.15.",
        chunks: [{ section: "Late Opening", page: 16, content: "Late Opening" }],
        roster: [],
      }).map((failure) => failure.kind),
    ).toEqual(["citation"]);
  });

  it("a retrieval row does not copy the PDF page into the printed page", () => {
    expect(
      printedPageFromRetrieval({
        page: 16,
        locator: "Page 15 — Late Opening",
        content: "Late Opening",
      }),
    ).toBe(15);
    expect(
      printedPageFromRetrieval({
        page: 16,
        locator: "Page 16 — Late Opening",
        content: "15 | P a g e\nLate Opening",
      }),
    ).toBe(15);
    expect(printedPageFromRetrieval({ page: 16, locator: "Page 16", content: "Late Opening" })).toBeNull();
  });
});

describe("Did you mean is a note, and the typed title wins", () => {
  const person: GroundedPerson = {
    id: "1",
    firstName: "Kaitlyn",
    lastName: "Brook",
    locationIds: ["loc-264"],
    title: "Team Member",
    primaryLocationName: null,
    positionName: "Team Member",
  };
  const prep: GroundedPrep = {
    question: "coaching form for Katlin Brook, Store Director",
    rosterIds: null,
    keptTypedNames: [],
    unmatched: [],
    ambiguous: [],
    ambiguousTyped: null,
    keptTypedName: null,
    employeeId: null,
  };

  it("the card keeps the typed name and says Woven has the close match", () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const proposal = {
      proposalId: "p",
      templateKey: "coaching",
      templateName: "Coaching Form",
      supportsInlineDraft: true,
      variantKey: null,
      employeeName: "Kaitlyn Brook",
      employeeRole: "Team Member",
      formDate: null,
      locationId: "loc-264",
      locationName: "Omaha",
      locationResolution: "resolved",
      authorizedLocationIds: [],
      status: "ready",
      sourceMessageIds: [],
    } as ChatFormProposal;
    const applied = applyGroundedProposal(
      {
        content:
          'Did you mean **Kaitlyn Brook**? I couldn\'t find **Katlin Brook** exactly in the employee list for your stores, so I want to be sure before it goes on the form.',
        citations: [],
        coverage: "not_applicable",
        formProposal: proposal,
      },
      { people: [person], prep, rosterEmpty: false },
    );
    expect(applied.content).toBe(wovenCloseNote("Kaitlyn Brook"));
    expect(applied.content.startsWith("Did you mean")).toBe(false);
    expect(applied.formProposal?.employeeName).toBe("Katlin Brook");
    expect(applied.formProposal?.employeeRole).toBe("Store Director");
    expect(applied.formProposal?.status).toBe("ready");
  });

  it("a typed job title is not replaced with Woven's title", () => {
    const employee = {
      id: "1",
      firstName: "Test",
      lastName: "Employee",
      locationIds: ["loc-264"],
      positionName: "Team Member",
      employmentStatus: "active",
      lastSyncedAt: new Date().toISOString(),
    } as RosterEmployee;
    delete process.env.TYPED_NAME_ENABLED;
    expect(verifyEmployee({ employee, managerTitle: "Store Director" }).note ?? "").toMatch(/form uses \*\*Team Member\*\*/);
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    expect(verifyEmployee({ employee, managerTitle: "Store Director" }).note ?? "").not.toMatch(/form uses/);
  });
});

describe("based, state codes, and policy phrases are not a person or a store", () => {
  it("the stop list is the company's states and the manual's titles", () => {
    const stops = companyNameStops();
    expect(stops.stateCodes.has("NE")).toBe(true);
    expect(stops.stateCodes.has("TT")).toBe(false);
    expect(stops.titleWords.has("policy")).toBe(true);
    expect(stops.titleWords.has("manual")).toBe(true);
    expect(isTypedStopSpan("based", stops)).toBe(true);
    expect(isTypedStopSpan("NE", stops)).toBe(true);
    expect(isTypedStopSpan("JBA Manual", stops)).toBe(true);
    expect(isTypedStopSpan("workplace policy", stops)).toBe(true);
    expect(isTypedStopSpan("TT", stops)).toBe(false);
  });

  it("flag on, those words are not the employee", () => {
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    expect(extractEmployeeNames("coaching form based on uniform").join(" ")).not.toMatch(/\bbased\b/i);
    const asked = extractEmployeeNames("write a verbal CA for Team Member TT at Dodge, NE. JBA Manual 1-1-25");
    expect(asked.join(" ")).not.toMatch(/\bNE\b/);
    expect(asked.join(" ").toLowerCase()).not.toContain("jba");
    expect(asked.join(" ")).toMatch(/\bTT\b/);
  });

  it("flag on, workplace policy is not a store", () => {
    const text = "she let a visitor in the workplace policy store";
    delete process.env.TYPED_NAME_ENABLED;
    const before = readStoreMentions(text);
    expect(before.unmatched.join(" ") + before.mentions.map((mention) => mention.matched).join(" ")).toMatch(/workplace/i);
    vi.stubEnv("TYPED_NAME_ENABLED", "1");
    const after = readStoreMentions(text);
    expect(after.unmatched.join(" ")).not.toMatch(/workplace/i);
    expect(after.mentions.map((mention) => mention.matched).join(" ")).not.toMatch(/workplace/i);
  });
});
