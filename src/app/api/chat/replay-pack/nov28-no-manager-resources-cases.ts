import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { loopStandIn } from "./loop-stand-in";

/**
 * ============================================================================
 * NO MANAGER RESOURCES PAGE, AND THE AI DOES NOT POINT AT ONE (port of the sibling app, the owner, 28 Nov 2026)
 * ============================================================================
 *
 * The owner, about the sibling app's Manager Resources page: "hide this to everyone since i think all inside are
 * placeholders". This app never had the page. Through the real chat route with production's flags, a manager asking
 * for it is offered no read_manager_resources tool and nothing the model is given names the page or a /resources URL,
 * so a later port of the sibling's page or reader can't bring it back here unnoticed.
 */
const REPORT = "The owner, 28 Nov 2026, about the Manager Resources page: \"hide this to everyone since i think all inside are placeholders\"";

export const NOV28_NO_MANAGER_RESOURCES_CASES: ReplayCase[] = [
  {
    id: "nov28-no-manager-resources-not-offered",
    title: "\"where are the manager resources?\": the model is given no read_manager_resources tool and no mention of a Manager Resources page",
    report: REPORT,
    status: "fixed",
    fixFlags: ["AGENT_LOOP_ENABLED"],
    async run(t) {
      if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
      vi.setSystemTime(new Date("2026-11-28T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn(() => ({ text: "I can't find that in Ask Bubbles." }));
      t.loopModel!(model);
      await t.thread().say("where are the manager resources?");

      expect(model.views.length, "the model was never asked").toBeGreaterThan(0);
      for (const names of model.toolNames) {
        expect(names.length, "the loop offered no tools at all, so this case proves nothing").toBeGreaterThan(0);
        expect(names, "the model was offered a Manager Resources reader").not.toContain("read_manager_resources");
      }
      for (const view of model.views) {
        expect(view.system, "the system prompt names a Manager Resources page").not.toMatch(/manager resources/i);
        expect(view.system, "the system prompt gives a /resources URL").not.toMatch(/["'(\s]\/resources\b/);
      }
    },
  },
];
