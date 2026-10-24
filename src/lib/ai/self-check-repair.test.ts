import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 8f7cf6d failed a typed name that Woven does not list, then showed the
 * repair "I couldn't find that person in the Woven roster." The name stays,
 * and that sentence is never the answer.
 */

const state = vi.hoisted(() => ({
  calls: 0,
  repair: "I couldn't find that person in the Woven roster.",
}));

vi.mock("server-only", () => ({}));
vi.mock("./call-claude", () => ({
  callClaude: async () => "An answer.",
  callClaudeTool: async () => {
    state.calls += 1;
    return { answer: state.repair };
  },
}));

import type { RosterEmployee } from "@/lib/forms/employee-match";

import { applySelfCheck } from "./self-check-repair";

const LARISSA: RosterEmployee = {
  id: "emp-larissa",
  firstName: "Larissa",
  lastName: "Venko",
  locationIds: ["loc-66"],
};

const ATTENDANCE = {
  section: "Attendance",
  page: 14,
  printedPage: 14,
  content: "Attendance\nAn employee is expected to be on time.",
};

const NAMED = "I will file this for Casey Quinn. See Dress Code Policy, JBA Policy Manual p.14.";

describe("applySelfCheck keeps a typed name", () => {
  const previous = process.env.SELF_CHECK_ENABLED;

  afterEach(() => {
    state.calls = 0;
    state.repair = "I couldn't find that person in the Woven roster.";
    if (previous === undefined) delete process.env.SELF_CHECK_ENABLED;
    else process.env.SELF_CHECK_ENABLED = previous;
  });

  it("does not call the model for a name Woven does not list", async () => {
    process.env.SELF_CHECK_ENABLED = "1";
    const answer = "I will file this for Casey Quinn.";
    const result = await applySelfCheck({
      answer,
      chunks: [],
      loadRoster: async () => [LARISSA],
    });
    expect(result).toBe(answer);
    expect(state.calls).toBe(0);
  });

  it("does not show a repair that drops Casey Quinn or says the person is missing from Woven", async () => {
    process.env.SELF_CHECK_ENABLED = "1";
    for (const repair of [
      "I couldn't find that person in the Woven roster.",
      "I couldn't find Casey Quinn in the Woven roster. The form is ready.",
      "Not verified — no matching employee in Woven",
    ]) {
      state.calls = 0;
      state.repair = repair;
      const result = await applySelfCheck({
        answer: NAMED,
        chunks: [ATTENDANCE],
        loadRoster: async () => [LARISSA],
      });
      expect(result).toBe(NAMED);
      expect(result).not.toMatch(/couldn't find|not verified/i);
      expect(state.calls).toBe(1);
    }
  });

  it("keeps a citation repair that still names Casey Quinn", async () => {
    process.env.SELF_CHECK_ENABLED = "1";
    state.repair = "I will file this for Casey Quinn. See Attendance Policy, JBA Policy Manual p.14.";
    const result = await applySelfCheck({
      answer: NAMED,
      chunks: [ATTENDANCE],
      loadRoster: async () => [LARISSA],
    });
    expect(result).toBe(state.repair);
    expect(result).toContain("Casey Quinn");
  });

  it("leaves the answer alone when the flag is off", async () => {
    delete process.env.SELF_CHECK_ENABLED;
    const result = await applySelfCheck({
      answer: NAMED,
      chunks: [ATTENDANCE],
      loadRoster: async () => [LARISSA],
    });
    expect(result).toBe(NAMED);
    expect(state.calls).toBe(0);
  });
});
