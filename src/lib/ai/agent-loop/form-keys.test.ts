import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EMPLOYMENT_CHANGE_TEMPLATE_SEEDS } from "@/lib/forms/employment-change-library";
import { EXIT_TEMPLATE_SEEDS } from "@/lib/forms/exit-library";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";

import { BUBBLES_CONFIG } from "./app-config";

/*
 * QA2 (21 Nov 2026, Pau: "the forms work the same as in the sibling app"): both live databases hold the same 17 forms
 * under the same names; the only key that differs is the exit form ("resignation-exit" here). The loop proposes from
 * this app's live library (`creatableTemplates`) and treats four forms specially through the app config; every one of
 * them, and every form the sibling app's loop proposes, is a real template key in this app's library.
 */
const libraryKeys = new Set([...TEMPLATE_SEEDS, ...EXIT_TEMPLATE_SEEDS, ...EMPLOYMENT_CHANGE_TEMPLATE_SEEDS].map((seed) => seed.key));

describe("every form the agent loop works with is one of this app's templates", () => {
  it("the four forms the loop treats specially are this app's keys", () => {
    for (const [role, key] of Object.entries(BUBBLES_CONFIG.formKeys)) {
      expect(libraryKeys.has(key), `${role}: "${key}" is not a template key here; the library has ${[...libraryKeys].sort().join(", ")}`).toBe(true);
    }
    expect(BUBBLES_CONFIG.formKeys.exit).toBe("resignation-exit");
  });

  it("the performance, review, EPP and employment-change forms the sibling app's loop proposes are here, under the same keys", () => {
    const sameKeys = ["coaching", "dpoa", "follow-up-coaching", "policy-review", "demotion", "position-transfer", "sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-dmit", "dmit-epp-tsd"];
    for (const key of sameKeys) {
      expect(libraryKeys.has(key), `"${key}" is not a template key here; the library has ${[...libraryKeys].sort().join(", ")}`).toBe(true);
    }
  });

  it("no exit key of the sibling app's is a key here", () => {
    expect(libraryKeys.has("stc-exit")).toBe(false);
  });
});
