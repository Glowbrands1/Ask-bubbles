import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ManualChunk } from "@/lib/forms/official-policy-manual";
import type { RosterEmployee } from "@/lib/forms/employee-match";
import { correctiveActionPlan } from "@/lib/forms/ca-action-plan";
import { CA_ACTION_PLAN_CLOSING } from "@/lib/forms/required-closing";
import {
  actionPlanSentenceCount,
  enforceTwoSentenceActionPlan,
} from "@/lib/forms/action-plan-sentences";
import { mergeDraftEdits, showDraftWithEdits } from "@/lib/forms/draft-edit-merge";
import { sameIncident } from "@/lib/forms/incident-key";
import { incidentFingerprint } from "@/lib/forms/incident-key";
import { CHAT_QUALITY_FLAG_NAMES, envFlag } from "@/lib/config/chat-quality-flags";

import {
  filterEmployeeCandidates,
  groundEmployeeResolution,
  isPolicySourceSpan,
} from "./employee-candidate-grounding";
import { augmentIntakeQuestion, fieldLines } from "./intake-augment";
import { fieldsFromManagerText, retainFieldsInReply } from "./form-field-state";
import { applyOptionalPriorCoaching } from "./prior-coaching-optional";
import { citedSections, withMappedPolicy } from "./violation-policy";

/**
 * Anonymized replay of chat-quality failures. The employee is Marissa Lempka.
 * Add a case by copying her wording, including lowercase and a typo, and
 * asserting the field the manager already gave. See docs/chat-quality-replay.md.
 */

const TODAY = "2026-10-21";
const MARISSA: RosterEmployee = {
  id: "emp-marissa",
  firstName: "Marissa",
  lastName: "Lempka",
  locationIds: ["loc-0001"],
  positionName: "Sales Associate",
};

const SOURCES = [
  "JBA Policy Manual",
  "2025 JBA Policy Manual - Edited 5-2025",
  "Standards of Conduct",
  "Late Opening",
  "Attendance",
  "Cell Phone/Smart Watch Policy",
];

function chunk(section: string, page: number): ManualChunk {
  return {
    chunkIndex: page,
    page,
    printedPage: page,
    section,
    content: `${section}\nThe company states this rule.`,
    sections: [{ heading: section, page }],
  };
}

const MANUAL: ManualChunk[] = [
  chunk("Standards of Conduct", 12),
  chunk("Late Opening", 15),
  chunk("Attendance", 14),
  chunk("Cell Phone/Smart Watch Policy", 19),
];

const REVIEW = "Management will review the Standards of Conduct policy with Marissa.";
const PLAN = `${REVIEW} ${CA_ACTION_PLAN_CLOSING}`;

describe("chat quality flags stay off unless set", () => {
  const touched: string[] = [];
  afterEach(() => {
    for (const name of touched) delete process.env[name];
    touched.length = 0;
  });

  it("treats unset, empty, and off as off, and the on-values as on", () => {
    expect(envFlag("ACTION_PLAN_SENTENCES_ENABLED")).toBe(false);
    process.env.ACTION_PLAN_SENTENCES_ENABLED = "";
    touched.push("ACTION_PLAN_SENTENCES_ENABLED");
    expect(envFlag("ACTION_PLAN_SENTENCES_ENABLED")).toBe(false);
    for (const value of ["0", "false", "off", "no"]) {
      process.env.DRAFT_EDIT_MERGE_ENABLED = value;
      expect(envFlag("DRAFT_EDIT_MERGE_ENABLED")).toBe(false);
    }
    touched.push("DRAFT_EDIT_MERGE_ENABLED");
    for (const value of ["1", "true", "on", "yes"]) {
      process.env.SLOT_RETENTION_ENABLED = value;
      expect(envFlag("SLOT_RETENTION_ENABLED")).toBe(true);
    }
    touched.push("SLOT_RETENTION_ENABLED");
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("ACTION_PLAN_SENTENCES_ENABLED");
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("DRAFT_EDIT_MERGE_ENABLED");
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("DRAFT_MERGE_ENABLED");
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("GROUNDED_ENTITIES_ENABLED");
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("FORM_STATE_ENABLED");
  });

  it("leaves a question unchanged when both intake flags are off", () => {
    const question = "ca for marisa lempka";
    expect(augmentIntakeQuestion({ slots: false, fields: false, question, history: [], today: TODAY })).toBe(question);
  });
});

describe("a Standards of Conduct corrective action keeps the employee and cites the manual", () => {
  const wordings = [
    "Create a corrective action for Marissa Lempka for a Standards of Conduct violation. She refused to follow directions.",
    "ca for marisa lempka for a standards of conduct violation. she refused to follow directions.",
  ];

  it.each(wordings)("does not ask for the name again: %s", (text) => {
    const decision = groundEmployeeResolution({
      candidates: ["NE", "Testy Testerson", "JBA Manual", "Standards of Conduct"],
      text,
      roster: [MARISSA],
      headings: SOURCES,
    });
    expect(decision).toEqual({ kind: "resolved", name: "Marissa Lempka" });

    const fields = fieldsFromManagerText(text, TODAY, [MARISSA]);
    expect(fields.employeeName).toBe("Marissa Lempka");
    const reply = retainFieldsInReply(
      "Nothing has been created yet.\nEmployee's full name\nStore",
      fields,
    );
    expect(reply.toLowerCase()).not.toContain("employee's full name");
    expect(reply).toContain("Marissa Lempka");

    const continued = applyOptionalPriorCoaching(
      "I won't create this corrective action because the Forms Register has no prior coaching.\nYou'll set any prior coaching or corrective action on the form — I won't guess at it.",
      { enabled: true, records: [], managerText: text },
    );
    expect(continued).toContain("The draft can still be created.");
    expect(continued.toLowerCase()).not.toContain("i won't create");
  });

  it("cites Standards of Conduct by name and page from the JBA Policy Manual", () => {
    // Pau, 23 Oct 2026: the citation is the policy name and the chunk's page.
    // The form writes "Standards of Conduct Policy, JBA Policy Manual p.12".
    const turns = ["Create a CA for Marissa Lempka for a Standards of Conduct violation."];
    const cited = citedSections(turns, MANUAL);
    expect(cited).toEqual([{ section: "Standards of Conduct", page: 12 }]);
    const answer = withMappedPolicy("I can draft that corrective action.", turns, MANUAL, true);
    expect(answer).toContain("**Policy cited from the JBA Policy Manual**");
    expect(answer).toContain("Standards of Conduct Policy, JBA Policy Manual p.12");
  });
});

describe("show draft with edits merges into Offense and the Action Plan", () => {
  it("recognizes the request and does not blank fields that already have text", () => {
    expect(showDraftWithEdits("show draft with edits")).toBe(true);
    expect(showDraftWithEdits("show draft of exit")).toBe(false);
    const merged = mergeDraftEdits({
      existingValues: {
        policy_violated: "Standards of Conduct",
        action_plan: PLAN,
        observation: "She refused to follow directions.",
      },
      incomingValues: {
        policy_violated: "",
        action_plan: "",
        observation: "She refused to follow directions.\nThe manager warned her again.",
      },
      existingChecked: { offense_type: ["standards_of_conduct"] },
      incomingChecked: { offense_type: [] },
    });
    expect(merged.values.policy_violated).toBeUndefined();
    expect(merged.values.action_plan).toBeUndefined();
    expect(merged.values.observation).toContain("warned her again");
    expect(merged.checked.offense_type).toBeUndefined();
  });

  it("folds a non-empty edit into the action plan instead of replacing it", () => {
    const merged = mergeDraftEdits({
      existingValues: { action_plan: PLAN, policy_violated: "Standards of Conduct" },
      incomingValues: {
        action_plan: "Review it with her at the start of the shift.",
        policy_violated: "Standards of Conduct — insubordination",
      },
    });
    expect(merged.values.action_plan).toContain(REVIEW);
    expect(merged.values.action_plan).toContain("start of the shift");
    expect(merged.values.policy_violated).toContain("Standards of Conduct");
    expect(merged.values.policy_violated).toContain("insubordination");
  });
});

describe("a policy source and a fragment are not employee candidates", () => {
  it("treats JBA Manual as the policy manual, and drops NE and Testy Testerson from a confused list", () => {
    expect(isPolicySourceSpan("JBA Manual", ["JBA Policy Manual"])).toBe(true);
    expect(isPolicySourceSpan("JBA Manual", ["2025 JBA Policy Manual - Edited 5-2025"])).toBe(true);
    expect(isPolicySourceSpan("Marissa Lempka", SOURCES)).toBe(false);

    expect(
      filterEmployeeCandidates({
        candidates: ["NE", "Testy Testerson", "JBA Manual"],
        roster: [MARISSA],
        headings: SOURCES,
      }),
    ).toEqual([]);

    const decision = groundEmployeeResolution({
      candidates: ["NE", "Testy Testerson", "JBA Manual"],
      text: "The employee is Marissa Lempka. Cite the JBA Manual.",
      roster: [MARISSA],
      headings: SOURCES,
    });
    expect(decision).toEqual({ kind: "resolved", name: "Marissa Lempka" });
  });

  it("keeps a single full name the roster does not know", () => {
    expect(
      filterEmployeeCandidates({
        candidates: ["Casey Newhire"],
        roster: [MARISSA],
        headings: SOURCES,
      }),
    ).toEqual(["Casey Newhire"]);
  });
});

describe("the action plan is exactly two sentences when that check is asked for", () => {
  it("leaves the existing builder's payroll sentence in place", () => {
    const built = correctiveActionPlan({
      citedPolicies: ["Standards of Conduct"],
      employeeName: "Marissa Lempka",
      payroll: { answer: "yes", amount: "$3.25" },
    });
    expect(actionPlanSentenceCount(built)).toBe(3);
    const enforced = enforceTwoSentenceActionPlan(built);
    expect(enforced.valid).toBe(true);
    expect(actionPlanSentenceCount(enforced.value)).toBe(2);
    expect(enforced.value.startsWith("Management will review the Standards of Conduct policy with Marissa.")).toBe(true);
    expect(enforced.value.endsWith(CA_ACTION_PLAN_CLOSING)).toBe(true);
  });

  it("accepts a plan that is already two sentences", () => {
    const enforced = enforceTwoSentenceActionPlan(PLAN);
    expect(enforced).toEqual({ value: PLAN, valid: true });
  });
});

describe("a missed month-day and a different incident", () => {
  it("restates on 10-1 as 10/1 and not the later day", () => {
    const lines = fieldLines("it happened on 10-1", TODAY);
    expect(lines.join(" ")).toContain("10/1/2026");
    expect(lines.join(" ")).not.toContain("10/21");
  });

  it("does not treat a different day as the same incident", () => {
    const first = incidentFingerprint({
      employeeName: "Marissa Lempka",
      formDate: "2026-10-01",
      text: "refused to follow directions",
    });
    const second = incidentFingerprint({
      employeeName: "Marissa Lempka",
      formDate: "2026-10-21",
      text: "refused to follow directions",
    });
    expect(sameIncident(first, second)).toBe(false);
    expect(sameIncident(first, first)).toBe(true);
  });
});

describe("the new migrations stay server-only and do not declare a vector width", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const added = readdirSync(dir).filter((name) => name.startsWith("20261023"));

  it("enables row level security, revokes browser roles, and keeps rollback as comments", () => {
    expect(added.length).toBeGreaterThanOrEqual(6);
    for (const name of added) {
      const sql = readFileSync(join(dir, name), "utf8");
      const statements = sql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      expect(statements, name).not.toMatch(/vector\s*\(\s*\d+\s*\)/i);
      expect(sql, name).toMatch(/Rollback:/);
      if (/create\s+table/i.test(statements)) {
        expect(statements, name).toMatch(/enable row level security/i);
        expect(statements, name).toMatch(/force row level security/i);
        expect(statements, name).toMatch(/revoke all on public\.\w+ from anon, authenticated/i);
      }
      if (/create or replace function/i.test(statements)) {
        expect(statements, name).toMatch(/revoke all on function/i);
        expect(statements, name).toMatch(/to service_role/i);
        expect(statements, name).not.toMatch(/grant execute on function[\s\S]*to anon/i);
      }
    }
  });
});
