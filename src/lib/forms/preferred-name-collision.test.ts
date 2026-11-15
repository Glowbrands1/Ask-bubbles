import { afterEach, describe, expect, it, vi } from "vitest";

import type { AskResponse } from "@/lib/ai/types";

import { installPreferredAliases, nameAsSaid, withPreferredNameShown } from "./preferred-name-shown";

/**
 * QA's review of Ask Sunny #1013 @ef62a035 (15 Nov 2026), ported: a saved name is never another roster person's.
 * Lorraine Fairweather (preferred Rae) beside a separate legal Rae Fairweather: "write up rae fairweather" with Lorraine
 * on the card keeps "Lorraine Fairweather", with no "(… in Woven)". Invented names.
 */
afterEach(() => {
  installPreferredAliases(() => undefined);
  vi.unstubAllEnvs();
});

describe("a preferred name that is another roster person's name is never used (READABLE_NAMES_ENABLED)", () => {
  it("the legal name is kept, with no swap", () => {
    vi.stubEnv("READABLE_NAMES_ENABLED", "true");
    installPreferredAliases(() => [
      { id: "lf", legal: "Lorraine Fairweather", preferred: "Rae Fairweather" },
      { id: "rf", legal: "Rae Fairweather", preferred: "Rae Fairweather" },
    ]);
    const card = { content: "For **Lorraine Fairweather**.", formProposal: { employeeName: "Lorraine Fairweather" } } as unknown as AskResponse;
    const out = withPreferredNameShown(card, "write up rae fairweather for being late");
    expect(out.formProposal?.employeeName).toBe("Lorraine Fairweather");
    expect(out.content).not.toContain("in Woven)");
  });

  it("with no other Rae, the preferred name is the manager's, as before", () => {
    const alias = { id: "lf", legal: "Lorraine Fairweather", preferred: "Rae Fairweather" };
    expect(nameAsSaid(alias, "write up rae fairweather", [{ id: "lf", names: [alias.legal, alias.preferred] }])).toBe("Rae Fairweather");
    expect(nameAsSaid(alias, "write up rae fairweather", [{ id: "lf", names: [alias.legal, alias.preferred] }, { id: "rf", names: ["Rae Fairweather"] }])).toBe("Lorraine Fairweather");
  });
});
