import { expect, vi } from "vitest";

import { BCS_BRAND } from "@/config/company/brand";
import { POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * ONLY THIS COMPANY'S BRAND IN A REPLY (Pau, 6 Nov 2026; OWN_BRAND_ONLY_ENABLED)
 * ============================================================================
 *
 * A live reply said "This applies company-wide across all brands — <this
 * brand>, <two other brands> — pets are not allowed…". Pau: "remove other
 * brand names, should be only buff city soap". The answering model writes
 * that sentence here; the other brands are read from the config's patterns,
 * never written in this app's code.
 */

const nameOf = (source: string) => source.replace(/\(\?:[^)]*\)\?/g, "").replace(/\\s\+/g, " ");
const OTHERS = POLICY_MANUAL_BRAND_SCOPE.otherBrands.map(nameOf).filter((name) => name.length > 3);
const OWN = BCS_BRAND.brandName;

export const NOV6_OWN_BRAND_ONLY_CASES: ReplayCase[] = [
  {
    id: "nov6-own-brand-only-pets",
    title: "a policy answer listing every brand (\"across all brands — …\") names only this company's brand",
    report: "Pau, 6 Nov 2026 (relayed by QA): \"remove other brand names, should be only buff city soap\"",
    status: { open: "the reply lists the other brands" },
    fixFlags: ["OWN_BRAND_ONLY_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      t.modelSays(`This applies company-wide across all brands — ${OWN}, ${OTHERS.join(", ")} — pets are not allowed in the workplace [p.29].`);
      const reply = await thread.say("can employees bring their dog to work?");
      for (const other of OTHERS) expect(reply.content, `the reply names another brand:\n${reply.content}`).not.toContain(other);
      expect(reply.content, `the reply lost the policy:\n${reply.content}`).toMatch(new RegExp(`at ${OWN} — pets are not allowed`));
    },
  },
];
