import { beforeEach, describe, expect, it, vi } from "vitest";

import { retrievedSubset } from "@/test/policy-from-manual-fixture";

/**
 * Step A (POLICY_CITATION_CHECK_ENABLED): the pick is resolved only when code
 * verifies it. The model call is mocked: no network, no key.
 */

const call = vi.hoisted(() => ({ result: null as unknown, inputs: [] as unknown[] }));

vi.mock("./call", () => ({
  callPolicyPickModel: vi.fn(async (input: unknown) => {
    call.inputs.push(input);
    return call.result;
  }),
}));

const { resolvePolicy } = await import("./resolve");
const { POLICY_PICK_SYSTEM_PROMPT } = await import("./prompt");

const chunks = retrievedSubset();
const base = {
  templateName: "Corrective Action",
  todayIso: "2026-11-03",
  cardLine: null,
  managerTurns: ["CA for a team member who was late to her shift three times this month"],
  chunks,
};

const VALID_PICK = {
  section_title: "Attendance",
  page: 14,
  chunk_id: "idx-41",
  quote: "It is the responsibility of each employee to know his or her work schedule and to always be on time.",
  confidence: 0.9,
  alternatives: [{ section_title: "Late Opening", page: 15, chunk_id: "idx-42" }],
  asks_about_policy: false,
};

beforeEach(() => {
  call.inputs = [];
});

describe("resolvePolicy", () => {
  it("resolves a valid pick, with the manual's heading, page and quote", async () => {
    call.result = { ok: true, output: VALID_PICK };
    await expect(resolvePolicy(base)).resolves.toEqual({
      status: "resolved",
      heading: "Attendance",
      page: 14,
      quote: VALID_PICK.quote,
      chunkId: "idx-41",
      asksAboutPolicy: false,
    });
    const sent = call.inputs[0] as { system: string; manual: string; prompt: string; schema: Record<string, unknown> };
    expect(sent.system).toBe(POLICY_PICK_SYSTEM_PROMPT);
    expect(sent.manual).toContain('<chunk id="idx-41" headings="Attendance (p.14)">');
    expect(sent.prompt).toContain("Manager: CA for a team member who was late");
    expect(sent.prompt).toContain("Policy on the card now: none");
  });

  it("takes the page from the manual, not the model", async () => {
    call.result = { ok: true, output: { ...VALID_PICK, page: 15 } };
    const resolved = await resolvePolicy(base);
    expect(resolved).toMatchObject({ status: "resolved", heading: "Attendance", page: 14 });
  });

  it("an invented quote is never returned: the manager chooses from the sections that pass", async () => {
    call.result = { ok: true, output: { ...VALID_PICK, quote: "Employees who are late three times in a month will receive a written warning." } };
    const resolved = await resolvePolicy(base);
    expect(["choose", "unavailable"]).toContain(resolved.status);
    expect(resolved).toEqual({
      status: "choose",
      options: [
        { heading: "Attendance", page: 14 },
        { heading: "Late Opening", page: 15 },
      ],
      reason: "quote_not_in_manual",
      asksAboutPolicy: false,
    });
    expect(JSON.stringify(resolved)).not.toContain("written warning");
  });

  it("an invented heading with invented alternatives is unavailable", async () => {
    call.result = {
      ok: true,
      output: { ...VALID_PICK, section_title: "Tardiness Policy", alternatives: [{ section_title: "Punctuality", page: 3, chunk_id: "idx-41" }] },
    };
    await expect(resolvePolicy(base)).resolves.toEqual({ status: "unavailable", reason: "heading_not_retrieved", asksAboutPolicy: false });
  });

  it("a quote outside the picked section, or low confidence, is not resolved", async () => {
    call.result = { ok: true, output: { ...VALID_PICK, section_title: "Late Opening", alternatives: [] } };
    await expect(resolvePolicy(base)).resolves.toMatchObject({ status: "choose", reason: "quote_outside_section" });
    call.result = { ok: true, output: { ...VALID_PICK, confidence: 0.4 } };
    await expect(resolvePolicy(base)).resolves.toMatchObject({ status: "choose", reason: "low_confidence" });
  });

  it("a timeout is unavailable", async () => {
    call.result = { fallback: "timeout" };
    await expect(resolvePolicy(base)).resolves.toEqual({ status: "unavailable", reason: "timeout", asksAboutPolicy: false });
  });

  it("an object the schema refuses is unavailable", async () => {
    call.result = { ok: true, output: { section_title: "Attendance" } };
    await expect(resolvePolicy(base)).resolves.toEqual({ status: "unavailable", reason: "invalid", asksAboutPolicy: false });
  });

  it("passes asks_about_policy through", async () => {
    call.result = { ok: true, output: { ...VALID_PICK, asks_about_policy: true } };
    await expect(resolvePolicy(base)).resolves.toMatchObject({ status: "resolved", asksAboutPolicy: true });
  });

  it("with no manual, does not call the model", async () => {
    await expect(resolvePolicy({ ...base, chunks: [] })).resolves.toEqual({ status: "unavailable", reason: "no_manual", asksAboutPolicy: false });
    expect(call.inputs).toEqual([]);
  });
});
