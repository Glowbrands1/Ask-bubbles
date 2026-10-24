import { writeFileSync } from "node:fs";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";
import type { ManualChunk } from "@/lib/forms/official-policy-manual";
import { accountManualSections } from "@/lib/ai/account-manual-sections";
import { flaggedCitationWrite } from "@/lib/ai/policy-citation-fields";
import { correctiveActionPlan } from "@/lib/forms/ca-action-plan";
import { actionPlanSentenceCount } from "@/lib/forms/action-plan-sentences";

/**
 * b9–b12, word for word, from the 24 Oct 2026 low-rating notes.
 *
 * Local only. The roster and the form library are in memory. The policy
 * pages come from a fixture of the JBA manual's own headings. Nothing here
 * opens a network connection or the production database.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};
const state = vi.hoisted(() => ({ directory: [] as unknown[] }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FLAGS = [
  "TYPED_NAME_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "POLICY_CITATION_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
] as const;
const saved = new Map<string, string | undefined>();

function sheet(index: number, heading: string, page: number): ManualChunk {
  return {
    chunkIndex: index,
    page: page + 1,
    printedPage: page,
    section: heading,
    content: `${heading}\nPage ${page}\nThe company states this rule.`,
    sections: [{ heading, page }],
  };
}

const CHUNKS: readonly ManualChunk[] = [
  sheet(2, "Standards of Conduct", 12),
  sheet(3, "Attendance", 14),
  sheet(4, "Late Opening", 15),
  sheet(5, "Visitors in the Workplace", 29),
  sheet(6, "Animals in the Workplace", 30),
];

const MANUAL = {
  documentId: "doc-jba",
  documentTitle: "JBA Policy Manual Edited 5.2025",
  matchedBy: "fallback" as const,
};

interface Snap {
  turn: number;
  question: string;
  content: string;
  templateKey: string | null;
  employeeName: string | null;
  employeeRole: string | null;
  warningLevel: string | null;
  payrollDeduct: string | null;
  formDate: string | null;
  locationId: string | null;
  locationName: string | null;
  locationResolution: string | null;
  locationCandidates: string[];
  issue: string | null;
  status: string | null;
  citation: string;
  plan: string;
  planSentences: number;
}

interface Miss {
  check: string;
  detail: string;
}

const report: { id: string; snaps: Snap[]; misses: Miss[] }[] = [];

function snapOf(turn: number, question: string, content: string, proposal: ChatFormProposal | null | undefined, notes: string): Snap {
  const citation = flaggedCitationWrite({
    enabled: true,
    templateKey: "dpoa",
    values: { policy_language: "" },
    notes,
    chunks: CHUNKS,
    manual: MANUAL,
  }).values.policy_language ?? "";
  const headings = accountManualSections(notes, CHUNKS).map((section) => section.heading);
  const plan = correctiveActionPlan({
    citedPolicies: headings,
    employeeName: proposal?.employeeName ?? "",
    payroll: { answer: proposal?.payrollDeduct === "yes" ? "yes" : proposal?.payrollDeduct === "no" ? "no" : null },
  });
  return {
    turn,
    question,
    content,
    templateKey: proposal?.templateKey ?? null,
    employeeName: proposal?.employeeName ?? null,
    employeeRole: proposal?.employeeRole ?? null,
    warningLevel: proposal?.warningLevel ?? null,
    payrollDeduct: proposal?.payrollDeduct ?? null,
    formDate: proposal?.formDate ?? null,
    locationId: proposal?.locationId ?? null,
    locationName: proposal?.locationName ?? null,
    locationResolution: proposal?.locationResolution ?? null,
    locationCandidates: proposal?.locationCandidates ?? [],
    issue: proposal?.issue ?? null,
    status: proposal?.status ?? null,
    citation,
    plan,
    planSentences: actionPlanSentenceCount(plan),
  };
}

async function replay(turns: readonly string[]): Promise<Snap[]> {
  const messages: ChatMessage[] = [];
  const snaps: Snap[] = [];
  let open: string | undefined;
  let n = 0;
  const said: string[] = [];
  for (const text of turns) {
    n += 1;
    said.push(text);
    const response = await proposeFormForTurn({
      history: messages,
      question: text,
      questionMessageId: `u${n}`,
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      policyManual: async () => CHUNKS,
      policyManualIdentity: async () => ({ title: "JBA Policy Manual Edited 5.2025", confirmed: true }),
      ...(open ? { continueTemplateKey: open } : {}),
    });
    const proposal = response?.formProposal ?? null;
    if (proposal) open = proposal.templateKey;
    snaps.push(snapOf(n, text, response?.content ?? "", proposal, said.join("\n")));
    messages.push(
      { id: `u${n}`, role: "user", content: text, createdAt: "2026-10-24T18:00:00Z" } as ChatMessage,
      {
        id: `a${n}`,
        role: "assistant",
        content: response?.content ?? "",
        createdAt: "2026-10-24T18:00:01Z",
        ...(proposal ? { formProposal: proposal } : {}),
      } as ChatMessage,
    );
  }
  return snaps;
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function card(snaps: Snap[], turn: number): Snap | undefined {
  return snaps.find((item) => item.turn === turn);
}

function blob(item: Snap | undefined): string {
  if (!item) return "";
  return [item.content, item.issue ?? "", item.citation, item.employeeName ?? "", item.employeeRole ?? ""].join("\n");
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  for (const name of FLAGS) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    process.env[name] = "1";
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of FLAGS) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

afterAll(() => {
  writeFileSync("/tmp/replay-b9-b12.json", JSON.stringify(report, null, 2));
});

function finish(id: string, snaps: Snap[], misses: Miss[]) {
  report.push({ id, snaps, misses });
  expect(misses, misses.map((miss) => miss.check).join("; ")).toEqual([]);
}

describe("priority replay b9–b12, flags on, word for word", () => {
  it("b9 written CA for Test Employee", async () => {
    const snaps = await replay([
      "create a written corrective action for Team Member, Test Employee. Test was assigned to complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline. Previous coaching was a Verbal CA 10-1-26. Payroll deduct is not applicable.",
      "name is Test Employee",
      "this is a violation under Standards of Conduct",
    ]);
    const misses: Miss[] = [];
    const early = snaps.slice(0, 2).find((item) => item.templateKey === "dpoa" && /test employee/i.test(item.employeeName ?? ""));
    if (!early) misses.push({ check: "card by turn 2", detail: snaps.map((item) => `t${item.turn}:${item.templateKey}:${item.employeeName}`).join(" | ") });
    const last = card(snaps, 3);
    if (!last || last.templateKey !== "dpoa") misses.push({ check: "turn 3 same draft", detail: last?.templateKey ?? "none" });
    if (!/test employee/i.test(last?.employeeName ?? "")) misses.push({ check: "turn 3 keeps the name", detail: last?.employeeName ?? "none" });
    if (has(last?.content ?? "", /who is this|which employee|full name/i)) misses.push({ check: "turn 3 re-asks who", detail: (last?.content ?? "").slice(0, 240) });
    if (early && early.warningLevel !== "written") misses.push({ check: "written warning", detail: early?.warningLevel ?? "none" });
    if (early && early.payrollDeduct !== "no") misses.push({ check: "payroll N/A", detail: String(early?.payrollDeduct) });
    if (!snaps.some((item) => has(blob(item), /10-15|2026-10-15|october 15/i) || item.formDate === "2026-10-15")) {
      misses.push({ check: "deadline kept", detail: snaps.map((item) => item.formDate ?? "none").join(" | ") });
    }
    // signedDate prints 10/01/2026. "10-1" also matches the deadline 10-15, so it is not the prior.
    if (!snaps.some((item) => has(blob(item), /verbal/i) && has(blob(item), /\b(?:10[-/]0?1[-/](?:26|2026)|2026-10-01|october 1)\b/i))) {
      misses.push({ check: "prior verbal 10-1-26", detail: snaps.map((item) => item.content.slice(0, 400)).join(" || ") });
    }
    const cited = blob(last);
    if (!/standards of conduct/i.test(cited) || !/p\.?\s*12\b/i.test(cited)) {
      misses.push({ check: "Standards of Conduct p.12", detail: `reply:${(last?.content ?? "").slice(0, 300)} citation:${last?.citation}` });
    }
    if (snaps.some((item) => /not verified/i.test(item.content))) misses.push({ check: "validator text", detail: "Not verified" });
    finish("b9", snaps, misses);
  });

  it("b10 verbal CA for Testy Testerson at Dodge", async () => {
    const snaps = await replay([
      "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable",
      "employee name is Testy Testerson",
      "cite standards of conduct as policy violated",
      "show draft",
      "violation is that on 10-16-26 Testy was not measuring and weighing product",
      "show draft with edits",
    ]);
    const misses: Miss[] = [];
    for (const item of snaps) {
      if (/^ne$/i.test(item.employeeName ?? "")) misses.push({ check: `turn ${item.turn} employee is NE`, detail: item.employeeName ?? "" });
      if (/\bNE\b/.test(item.content) && /which of them|did you mean|candidate/i.test(item.content)) {
        misses.push({ check: `turn ${item.turn} offers NE`, detail: item.content.slice(0, 240) });
      }
      if (/haven't told me what happened/i.test(item.content)) misses.push({ check: `turn ${item.turn} says the incident is missing`, detail: item.content.slice(0, 240) });
    }
    const first = card(snaps, 1);
    if (first?.templateKey !== "dpoa") misses.push({ check: "turn 1 card", detail: first?.templateKey ?? "none" });
    if (!/testy testerson/i.test(first?.employeeName ?? "")) misses.push({ check: "turn 1 name", detail: first?.employeeName ?? "none" });
    if (first?.warningLevel !== "verbal") misses.push({ check: "verbal", detail: first?.warningLevel ?? "none" });
    if (first?.payrollDeduct !== "no") misses.push({ check: "payroll N/A", detail: String(first?.payrollDeduct) });
    if (first?.formDate !== "2026-10-16") misses.push({ check: "date 10-16-26", detail: first?.formDate ?? "none" });
    const storeName = `${first?.locationName ?? ""} ${first?.locationId ?? ""} ${(first?.locationCandidates ?? []).join(" ")}`;
    if (!/dodge|loc-264/i.test(storeName)) misses.push({ check: "Dodge store", detail: storeName || first?.locationResolution || "none" });
    const offense = snaps.map((item) => `${item.issue ?? ""}\n${item.content}`).join("\n");
    if (!/measur/i.test(offense) || !/weigh/i.test(offense)) misses.push({ check: "offense kept", detail: snaps.map((item) => item.issue).join(" | ") });
    const cited = snaps.slice(2).map(blob).join("\n");
    if (!/standards of conduct/i.test(cited) || !/p\.?\s*12\b/i.test(cited)) {
      misses.push({ check: "Standards of Conduct p.12", detail: snaps.map((item) => `t${item.turn}:${item.citation}`).join(" | ") });
    }
    for (const turn of [4, 6]) {
      const item = card(snaps, turn);
      if (!item?.templateKey) misses.push({ check: `turn ${turn} shows a card`, detail: item?.content.slice(0, 180) ?? "empty" });
    }
    const shown = card(snaps, 6);
    if (!/measur/i.test(`${shown?.issue ?? ""}\n${shown?.content ?? ""}`)) misses.push({ check: "show draft with edits keeps the offense", detail: shown?.issue ?? "none" });
    if (shown && (shown.planSentences !== 2 || !/management will review/i.test(shown.plan))) {
      misses.push({ check: "two-sentence action plan", detail: shown?.plan ?? "none" });
    }
    if (shown && !/management will review/i.test(`${shown.content}\n${shown.issue ?? ""}`) && shown.planSentences === 2) {
      misses.push({ check: "action plan on the card the manager is shown", detail: "plan computed, not in the reply" });
    }
    finish("b10", snaps, misses);
  });

  it("b11 verbal CA, late, JBA Manual is not an employee", async () => {
    const snaps = await replay([
      "write a verbal CA for Team Member, Testy Testerson at Dodge, NE. On 10-20-26 Testy was late for shift and did not call supervisor as outlined in attendance policy. payroll deduct is not applicable. previous coaching is JBA Manual 1-1-25",
    ]);
    const misses: Miss[] = [];
    const first = card(snaps, 1);
    if (first?.templateKey !== "dpoa") misses.push({ check: "card", detail: first?.templateKey ?? "none" });
    if (!/testy testerson/i.test(first?.employeeName ?? "")) misses.push({ check: "name", detail: first?.employeeName ?? "none" });
    if (/^ne$/i.test(first?.employeeName ?? "") || /jba/i.test(first?.employeeName ?? "")) {
      misses.push({ check: "NE or JBA Manual taken as the employee", detail: first?.employeeName ?? "" });
    }
    if (/\bNE\b/.test(first?.content ?? "") && /which of them|did you mean/i.test(first?.content ?? "")) {
      misses.push({ check: "offers NE", detail: (first?.content ?? "").slice(0, 240) });
    }
    if (first?.warningLevel !== "verbal") misses.push({ check: "verbal", detail: first?.warningLevel ?? "none" });
    if (first?.payrollDeduct !== "no") misses.push({ check: "payroll N/A", detail: String(first?.payrollDeduct) });
    if (first?.formDate !== "2026-10-20") misses.push({ check: "date 10-20-26", detail: first?.formDate ?? "none" });
    const storeName = `${first?.locationName ?? ""} ${first?.locationId ?? ""}`;
    if (!/dodge|loc-264/i.test(storeName)) misses.push({ check: "Dodge store", detail: storeName || "none" });
    const text = blob(first);
    if (!/attendance/i.test(text) || !/p\.?\s*14\b/i.test(text)) {
      misses.push({ check: "Attendance + page", detail: `citation:${first?.citation} reply:${(first?.content ?? "").slice(0, 300)}` });
    }
    // signedDate prints 01/01/2025.
    if (!/\b(?:0?1[-/]0?1[-/](?:25|2025)|2025-01-01|january 1)\b/i.test(text)) {
      misses.push({ check: "prior coaching 1-1-25", detail: (first?.content ?? "").slice(0, 500) });
    }
    if (/haven't told me what happened/i.test(first?.content ?? "")) misses.push({ check: "incident treated as missing", detail: "NO_INCIDENT" });
    finish("b11", snaps, misses);
  });

  it("b12 verbal CA for Sadie Hoffart, animals, Empire SD", async () => {
    const snaps = await replay([
      "do verbal for team member sadie hoffart at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 sadie was not scheduled to work and came into the store to show her team her new puppy. Sadie was in the store 45 min",
      "jba manual 11-1-25",
      "cite pets in workplace",
      "cite animals in the workplace policy",
      "store location is empire, sd. create corrective action",
    ]);
    const misses: Miss[] = [];
    for (const item of snaps) {
      if (item.templateKey === "coaching") misses.push({ check: `turn ${item.turn} coaching form`, detail: item.templateKey });
      if (/store director/i.test(item.employeeRole ?? "") || /you (?:said|called|described).{0,40}store director/i.test(item.content)) {
        misses.push({ check: `turn ${item.turn} Store Director`, detail: `${item.employeeRole ?? ""} ${item.content.slice(0, 200)}` });
      }
      if (/workplace policy/i.test(item.locationName ?? "")) misses.push({ check: `turn ${item.turn} workplace policy is the store`, detail: item.locationName ?? "" });
    }
    const first = card(snaps, 1);
    if (first?.templateKey !== "dpoa") misses.push({ check: "verbal CA card", detail: first?.templateKey ?? "none" });
    if (!/sadie hoffart/i.test(first?.employeeName ?? "")) misses.push({ check: "name", detail: first?.employeeName ?? "none" });
    if (first?.warningLevel !== "verbal") misses.push({ check: "verbal", detail: first?.warningLevel ?? "none" });
    if (first?.payrollDeduct !== "no") misses.push({ check: "payroll N/A", detail: String(first?.payrollDeduct) });
    if (first?.formDate !== "2026-10-22") misses.push({ check: "date 10-22-26", detail: first?.formDate ?? "none" });
    if (!/45/.test(blob(first))) misses.push({ check: "45 min kept", detail: first?.issue ?? (first?.content ?? "").slice(0, 200) });
    const corrected = card(snaps, 2);
    // signedDate prints 11/01/2025.
    if (!/\b(?:11[-/]0?1[-/](?:25|2025)|2025-11-01|november 1)\b/i.test(blob(corrected))) {
      misses.push({ check: "prior coaching corrected to 11-1-25", detail: (corrected?.content ?? "").slice(0, 500) });
    }
    const asked = snaps.map((item) => `${item.locationName ?? ""} ${item.locationCandidates.join(" ")} ${item.content}`).join("\n");
    const sioux = /sioux falls, sd \(w 41st st\)/i.test(asked) && /sioux falls, sd \(e 18th st\)/i.test(asked);
    const invented = snaps.some((item) => /empire/i.test(item.locationName ?? ""));
    if (!sioux) misses.push({ check: "asks once with the Sioux Falls stores", detail: snaps.map((item) => `t${item.turn}:${item.locationResolution}:${item.locationName}:${item.locationCandidates.join("/")}`).join(" | ") });
    if (invented) misses.push({ check: "invents Empire as a store", detail: snaps.map((item) => item.locationName).join(" | ") });
    const cited = snaps.map(blob).join("\n");
    if (!/animals in the workplace/i.test(cited) || !/p\.?\s*30\b/i.test(cited)) {
      misses.push({ check: "Animals in the Workplace + page", detail: snaps.map((item) => `t${item.turn}:${item.citation}`).join(" | ") });
    }
    if (!/visitors in the workplace/i.test(cited) || !/p\.?\s*29\b/i.test(cited)) {
      misses.push({ check: "Visitors in the Workplace + page", detail: snaps.map((item) => item.citation).join(" | ") });
    }
    finish("b12", snaps, misses);
  });
});
