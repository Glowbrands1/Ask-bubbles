import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agentLoopSystem } from "./agent-loop/prompt";
import { generalAdviceLabel } from "./general-advice";
import { buildSystemPrompt, withGeneralAdviceRule } from "./prompts";

/**
 * GENERAL_ADVICE (port from the sibling app; the owner, 28 Nov 2026): the rule reaches both the agent loop (its per-turn
 * lines, so the cached rules book is unchanged) and the chat's system prompt, only when the flag is on.
 */

afterEach(() => vi.unstubAllEnvs());

const facts = (generalAdvice?: { topic: "pay" | null }) =>
  agentLoopSystem({ managerName: "Test Testy", role: "manager", salons: ["West Dodge"], today: "2026-11-28", templates: [], headings: [], openFormId: null, ...(generalAdvice ? { generalAdvice } : {}) });

describe("the agent loop", () => {
  it("off: no general advice line", () => {
    expect(facts()).not.toMatch(/General advice/);
  });

  it("on: the per-turn line carries the label with the app's own brand", () => {
    expect(facts({ topic: null })).toContain(`"${generalAdviceLabel("Buff City Soap")}"`);
    expect(facts({ topic: "pay" })).toMatch(/This question is about pay and wages: no general advice on it\./);
  });
});

describe("the chat's system prompt", () => {
  const build = (hasContext: boolean) => buildSystemPrompt({
    assistantName: "Bubbles", brandName: "Buff City Soap", locationNoun: "store", mode: "standard", hasContext,
    context: { userName: "Test Manager", locationName: "Test Store", todayIso: "2026-11-28" },
  } as never);

  it("the rule follows the uncovered-question rule, and the no-match line defers to it (both templates)", () => {
    for (const cached of ["false", "true"]) {
      vi.stubEnv("PROMPT_CACHE_ENABLED", cached);
      const before = build(false);
      expect(before).toContain("offer general guidance only if it genuinely helps, and label it as general.");
      const ruled = withGeneralAdviceRule(before, "Buff City Soap", null);
      expect(ruled).toMatch(/say what you would need, and stop\.[^\n]*\n- General advice when the company documents have nothing/);
      expect(ruled).not.toContain("offer general guidance only if it genuinely helps");
      expect(ruled).toContain(`"${generalAdviceLabel("Buff City Soap")}"`);
      expect(withGeneralAdviceRule(build(true), "Buff City Soap", "legal")).toMatch(/This question is about legal and HR-legal matters: no general advice on it\./);
    }
  });
});
