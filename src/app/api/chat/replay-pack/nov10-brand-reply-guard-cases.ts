import { expect } from "vitest";

import { POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A POLICY REPLY NAMES ONLY THIS COMPANY AND KEEPS ITS RULE (QA's October triage of #198, 10 Nov 2026)
 * ============================================================================
 *
 * #198's questions, with the answering model scripted to the replies the triage saw on main: the attendance reply kept
 * "(Buff City Soap, JB & Associates office)", and the "for any brand under JB & Associates" late-opening reply was
 * dropped whole, rule included. Fixed with BRAND_REPLY_GUARD_ENABLED (`ai/brand-reply-rest.ts`).
 */
/* The other brands come from config, as in the step itself: no production-scanned file names another company. */
const OTHER_BRANDS = POLICY_MANUAL_BRAND_SCOPE.otherBrands.map((source) => source.replace(/\\s\+/g, " ").replace(/\(\?:[^)]*\)\?/g, ""));
const ATTENDANCE = `The attendance policy applies across all brands (Buff City Soap, ${OTHER_BRANDS.join(", ")}, JB & Associates office) [p.14]. A no call no show for a scheduled shift may result in immediate termination [p.14].`;
const LATE_OPENING = "The Late Opening policy applies for any brand under JB & Associates: the employee who failed to open reimburses $25.00 [p.15].";

export const NOV10_BRAND_REPLY_GUARD_CASES: ReplayCase[] = [
  {
    id: "nov10-brand-reply-guard-attendance-list",
    title: '"what does our policy say about attendance?": the brand list goes, the office with it, and the rule stays',
    report: "QA's October triage (10 Nov 2026) of #198, on main a529c29e with production's flags",
    status: { open: "the office stays in the brand list; fixed with BRAND_REPLY_GUARD_ENABLED" },
    fixFlags: ["BRAND_REPLY_GUARD_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      t.modelSays(ATTENDANCE);
      const reply = await t.thread().say("what does our policy say about attendance?");
      expect(reply.content, reply.content).not.toMatch(/jb\s*&\s*associates/i);
      for (const brand of POLICY_MANUAL_BRAND_SCOPE.otherBrands) expect(reply.content, reply.content).not.toMatch(new RegExp(String.raw`\b${brand}\b`, "i"));
      expect(reply.content, reply.content).toMatch(/no call no show for a scheduled shift may result in immediate termination \[p\.14\]/i);
    },
  },
  {
    id: "nov10-brand-reply-guard-late-opening-any-brand",
    title: '"what\'s the late opening policy": "for any brand under JB & Associates" reads "at Buff City Soap", and the rule stays',
    report: "QA's October triage (10 Nov 2026) of #198, on main a529c29e with production's flags",
    status: { open: "the reply is dropped whole, rule included; fixed with BRAND_REPLY_GUARD_ENABLED" },
    fixFlags: ["BRAND_REPLY_GUARD_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      t.modelSays(LATE_OPENING);
      const reply = await t.thread().say("what's the late opening policy");
      expect(reply.content, reply.content).not.toMatch(/jb\s*&\s*associates/i);
      expect(reply.content, reply.content).toMatch(/reimburses \$25\.00 \[p\.15\]/);
    },
  },
];
