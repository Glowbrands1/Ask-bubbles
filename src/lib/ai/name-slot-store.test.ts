import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * Round 1. The manager's own words for the name, the date slot, and the store.
 * Flags off, none of this runs. SELF_CHECK stays off.
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

const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");
const { readEmployeeMentions, statedJobTitle } = await import("@/lib/forms/proposal");

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FLAGS = ["TYPED_NAME_ENABLED", "ANTI_LOOP_ENABLED"] as const;

async function lastCard(turns: readonly string[]): Promise<ChatFormProposal | null> {
  const messages: ChatMessage[] = [];
  let open: string | undefined;
  let proposal: ChatFormProposal | null = null;
  for (const [index, text] of turns.entries()) {
    const response = await proposeFormForTurn({
      history: messages,
      question: text,
      questionMessageId: `u${index + 1}`,
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    proposal = response?.formProposal ?? null;
    if (proposal) open = proposal.templateKey;
    messages.push(
      { id: `u${index + 1}`, role: "user", content: text, createdAt: "2026-10-24T18:00:00Z" } as ChatMessage,
      {
        id: `a${index + 1}`,
        role: "assistant",
        content: response?.content ?? "",
        createdAt: "2026-10-24T18:00:01Z",
        ...(proposal ? { formProposal: proposal } : {}),
      } as ChatMessage,
    );
  }
  return proposal;
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.directory = [];
  for (const name of FLAGS) process.env[name] = "1";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of FLAGS) delete process.env[name];
});

describe("name, date slot, and store from the manager's words", () => {
  it("keeps dana moss and today's date", async () => {
    const card = await lastCard([
      "an employee (Dana) is talking negatively about co workers and customers. another employee, jordan, complained to the store director about Dana",
      "create coaching form for dana, works at bellevue as a team member. use todays date",
      "dana moss, team member at bellevue. use todays date",
    ]);
    expect(card?.employeeName).toBe("dana moss");
    expect(card?.formDate).toBe("2026-10-24");
    expect(card?.locationId).toBe("loc-67");
  });

  it("dates the form on the late opening, not the verbal that was given earlier", async () => {
    const card = await lastCard([
      "create a CA form for ima employee, team member at kearney, for opening the store late on 9-28-26",
      "this should be a written and note a verbal ca was given on 9-1-26",
      "the policy violated is late opening, not attendance",
    ]);
    expect(card?.employeeName).toBe("ima employee");
    expect(card?.formDate).toBe("2026-09-28");
    expect(card?.locationId).toBe("loc-66");
  });

  it("uses the store the manager named after a different store", async () => {
    const card = await lastCard([
      "create coaching form for employee test testy who is a team member at kearney. on 9-29-26 test was out of dress code",
      "employee name is casey quinn",
      "create coaching form for casey quinn",
      "create a coaching form for bellevue team member, casey quinn, who was talking on her cell phone for 25 minutes on 9-29-26 when customers were waiting to check in",
      "store location is bellevue, ne",
    ]);
    expect(card?.employeeName).toBe("casey quinn");
    expect(card?.formDate).toBe("2026-09-29");
    expect(card?.locationId).toBe("loc-67");
  });

  it("keeps Pat Rivera when the observation names new hire Sam Lee", async () => {
    const card = await lastCard([
      "create a CA for store director, pat rivera for violating the standards of conduct",
      "Pat Rivera, Store Director",
      "change observation of offense to: Pat completed onboarding with new hire Sam Lee on 9-28-26. As of 10-16-26 Sam had not acknowledged onboarding policies in Woven that should have been completed during onboarding.",
      "the policy violated is standards of conduct.",
    ]);
    expect(card?.employeeName).toBe("Pat Rivera");
    expect(card?.formDate).toBe("2026-10-16");
    expect(card?.locationId ?? null).toBeNull();
  });

  it("keeps morgan blake and the last day worked on the exit form", async () => {
    const card = await lastCard([
      "what does policy say about pets in the store",
      "assist with creating an exit form",
      "morgan blake, team member at lee's summit",
      "last day worked was 9-20-26. management called her with no response on 9-27-26",
      "its a no call no show",
      "create exit form",
    ]);
    expect(card?.employeeName).toBe("morgan blake");
    expect(card?.employeeName?.toLowerCase()).not.toBe("job title");
    expect(card?.employeeRole).toBe("Team Member");
    expect(card?.formDate).toBe("2026-09-20");
    expect(card?.locationId).toBe("loc-219");
    expect(card?.status).not.toBe("needs_employee");
  });

  it("puts the last day on casey quinn's exit form", async () => {
    const card = await lastCard([
      "create an exit form. employee name is casey quinn. casey was a team member at kearney. on 9-15-26 casey provided her resignation to management and her last day worked was 9-28-26",
      "casey gave and worked 2 week notice. all store items were returned and she is eligible for rehire",
    ]);
    expect(card?.employeeName).toBe("casey quinn");
    expect(card?.formDate).toBe("2026-09-28");
    expect(card?.locationId).toBe("loc-66");
  });

  it("puts the notice date on Quinn Adler's exit form", async () => {
    const card = await lastCard([
      "Can you create an exit form for me?",
      "Quinn Adler\nTeam Member\nNE Kearney\nGave notice - fulfilled notice\nGave notice 9/25/26 - date notice fulfilled 10/9/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire",
    ]);
    expect(card?.employeeName).toBe("Quinn Adler");
    expect(card?.formDate).toBe("2026-10-09");
    expect(card?.locationId).toBe("loc-66");
  });

  it("dates Riley Quinn's form today", async () => {
    const card = await lastCard([
      "Can you create me a performance CA?",
      "Riley Quinn today under performance for September, sales below goal, verbal warning received Open Ended Questions Coaching 9/8/2026, Focus Item Coaching 9/15/2026, New Product Coaching 9/25/2026 not payroll deductible Team Member",
      "Riley Quinn",
    ]);
    expect(card?.employeeName).toBe("Riley Quinn");
    expect(card?.employeeName?.toLowerCase()).not.toBe("job title");
    expect(card?.employeeName?.toLowerCase()).not.toBe("september");
    expect(card?.employeeName?.toLowerCase()).not.toBe("based");
    expect(card?.employeeRole).toBe("Team Member");
    expect(card?.formDate).toBe("2026-10-24");
  });

  it("puts the words after job title on the title, and never on the employee", async () => {
    const reading = readEmployeeMentions(
      "Riley Quinn today under performance for September. Job Title: Team Member",
    );
    expect(reading.names.map((name) => name.toLowerCase())).not.toContain("job title");
    expect(reading.names.join(" ").toLowerCase()).toContain("riley quinn");
    expect(statedJobTitle("Job Title: Team Member")).toBe("Team Member");
    expect(statedJobTitle("Job title: Floor Lead")).toBe("Floor Lead");

    const card = await lastCard([
      "Can you create me a performance CA?",
      "Riley Quinn today under performance for September, sales below goal. Job Title: Floor Lead. verbal warning received Open Ended Questions Coaching 9/8/2026, Focus Item Coaching 9/15/2026, New Product Coaching 9/25/2026 not payroll deductible",
      "Riley Quinn",
    ]);
    expect(card?.employeeName).toBe("Riley Quinn");
    expect(card?.employeeName?.toLowerCase()).not.toContain("job");
    expect(card?.employeeName?.toLowerCase()).not.toContain("title");
    expect(card?.employeeRole).toBe("Floor Lead");
    expect(card?.formDate).toBe("2026-10-24");
  });

  it("files Alex Morgan at the primary store", async () => {
    const card = await lastCard([
      "Put together a written CA for Alex Morgan, primary store is Sioux Falls W 41st. But on Monday 10/05/2026 Alex was working a shift at Sioux Falls E 18th and did not complete the closing clean",
      "Alex Morgan",
      "Create a Corrective Action Form from this conversation.",
    ]);
    expect(card?.employeeName).toBe("Alex Morgan");
    expect(card?.formDate).toBe("2026-10-05");
    expect(card?.locationId).toBe("loc-225");
  });

  it("keeps Jane Store when Store is the surname", async () => {
    const card = await lastCard([
      "create coaching form for Jane Store, team member at kearney. use todays date",
    ]);
    expect(card?.employeeName).toBe("Jane Store");
    expect(card?.employeeName?.toLowerCase()).not.toBe("store");
    expect(card?.employeeName?.toLowerCase()).not.toBe("job title");
    expect(card?.locationId).toBe("loc-66");
    expect(card?.formDate).toBe("2026-10-24");
  });
});

describe("s8, s17, and a Name: line", () => {
  beforeEach(() => {
    for (const name of FLAGS) process.env[name] = "1";
  });

  afterEach(() => {
    for (const name of FLAGS) delete process.env[name];
  });

  const s8 = "morgan blake, team member at lee's summit";
  const s17 =
    "Riley Quinn today under performance for September, sales below goal, verbal warning received Open Ended Questions Coaching 9/8/2026, Focus Item Coaching 9/15/2026, New Product Coaching 9/25/2026 not payroll deductible Team Member";

  it("s8 keeps Morgan Blake and does not take job, title, salon, or store as the employee", () => {
    const names = readEmployeeMentions(s8).names.map((name) => name.toLowerCase());
    expect(names).toContain("morgan blake");
    expect(names).not.toContain("job title");
    expect(names).not.toContain("job");
    expect(names).not.toContain("title");
    expect(names).not.toContain("salon");
    expect(names).not.toContain("store");
  });

  it("s17 keeps Riley Quinn and does not take job title, september, or based", () => {
    const names = readEmployeeMentions(s17).names.map((name) => name.toLowerCase());
    expect(names).toContain("riley quinn");
    expect(names).not.toContain("job title");
    expect(names).not.toContain("september");
    expect(names).not.toContain("based");
    expect(statedJobTitle(s17)).toBe("Team Member");
  });

  it("keeps Jane Store and Jane Salon, and still rejects a candidate that is the label", () => {
    expect(readEmployeeMentions("create a coaching form for Jane Store").names).toContain("Jane Store");
    expect(readEmployeeMentions("create a coaching form for Jane Salon").names).toContain("Jane Salon");
    expect(readEmployeeMentions("Job title").names.map((name) => name.toLowerCase())).not.toContain("job title");
    expect(readEmployeeMentions("Store").names.map((name) => name.toLowerCase())).not.toContain("store");
  });

  it("keeps the value after Name: and leaves the job title off the employee", () => {
    const text = "Name: Evangeline Pembury, job title tanning consultant";
    const names = readEmployeeMentions(text).names.map((name) => name.toLowerCase());
    expect(names).toEqual(["evangeline pembury"]);
    expect(statedJobTitle(text)).toBe("Tanning Consultant");
  });
});

describe("flags off, the same words do not move the card", () => {
  beforeEach(() => {
    for (const name of FLAGS) delete process.env[name];
  });

  it("leaves dana, and does not turn use todays date into a card date", async () => {
    const card = await lastCard([
      "an employee (Dana) is talking negatively about co workers and customers. another employee, jordan, complained to the store director about Dana",
      "create coaching form for dana, works at bellevue as a team member. use todays date",
      "dana moss, team member at bellevue. use todays date",
    ]);
    expect(card?.employeeName).toBe("dana");
    expect(card?.formDate ?? null).toBeNull();
  });
});
