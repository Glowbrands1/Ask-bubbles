import { expect } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";

/**
 * THE HARNESS GIVES A MANAGER ALL-STORE FORMS VISIBILITY AS PRODUCTION DOES (the round-2 tester's patch, QA 22 Nov 2026)
 *
 * Production's district managers read every store's forms on file through an unrevoked `forms_all_store_access` row of
 * mode `all` (`forms-visibility.ts`). The tester's round-2 runs patched the pack's fake store by hand so DM cases saw forms
 * on file; `t.formsAllStoreAccess()` is that patch as part of the harness (an invented row for the pack's own account).
 */
export const NOV22_HARNESS_FORMS_ALL_STORE_ACCESS_CASES: ReplayCase[] = [
  {
    id: "nov22-harness-forms-all-store-access",
    title: "Harness: t.formsAllStoreAccess() gives the signed-in manager every store's forms (mode all); without it a store manager reads their own store",
    report: "QA, 22 Nov 2026: the round-2 tester's forms_all_store_access harness patch, made part of the pack",
    status: "fixed",
    async run(t) {
      t.as("location_manager", WEST_DODGE);
      const { resolveFormsVisibility } = await import("@/lib/forms/forms-visibility");
      const identity = { subject: "qa-manager", role: "location_manager" as never, scope: WEST_DODGE as never };
      expect((await resolveFormsVisibility(identity)).level, "a store manager reads every store with no designation").not.toBe("global");
      t.formsAllStoreAccess!("all");
      expect((await resolveFormsVisibility(identity)).level).toBe("global");
    },
  },
];
