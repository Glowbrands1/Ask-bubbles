import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generalAdviceLabel } from "./general-advice";
import { buildSystemPrompt, withGeneralAdviceRule } from "./prompts";

/**
 * GENERAL_ADVICE_ENABLED (port from the sibling app): the owner, 28 Nov 2026, said "ok good" to giving the older chat's
 * unlabelled "as a general approach…" lines the same rule as labelled general advice. The statement taxonomy's "General
 * guidance" kind said "A phrase like \"as a general approach\" is enough"; on, it says such guidance goes only under the
 * exact label, never in a cited answer and never on a restricted topic. Off, the prompt is byte-for-byte as before.
 */

const PHRASE = 'A phrase like "as a general approach" is enough.';

afterEach(() => vi.unstubAllEnvs());

const build = (hasContext: boolean) => buildSystemPrompt({
  assistantName: "Bubbles", brandName: "Buff City Soap", locationNoun: "store", mode: "standard", hasContext,
  context: { userName: "Test Manager", locationName: "Test Store", todayIso: "2026-11-28" },
} as never);

describe("the statement taxonomy's general guidance", () => {
  for (const cached of ["false", "true"]) {
    it(`PROMPT_CACHE_ENABLED=${cached}: off keeps the phrase; on carries the label rule and drops it`, () => {
      vi.stubEnv("PROMPT_CACHE_ENABLED", cached);
      const off = build(true);
      expect(off).toContain(`general practice rather than Buff City Soap policy. ${PHRASE}`);
      const on = withGeneralAdviceRule(off, "Buff City Soap", null);
      expect(on).not.toContain(PHRASE);
      expect(on).toMatch(/General guidance — [^\n]*Never mark these with a source marker, and give such guidance only under the line "General advice \(not from Buff City Soap documents\):" exactly, never in an answer that cites a policy or document \(one with a \[p\.N\] or \[S#\] marker\), and never on company policy, pay, benefits, scheduling rules, discipline or legal questions\. Otherwise leave it out\./);
      expect(withGeneralAdviceRule(off, "Buff City Soap", "discipline")).toMatch(/and never on this question\. Otherwise leave it out\./);
      expect(on).toContain(`"${generalAdviceLabel("Buff City Soap")}"`);
    });
  }
});
