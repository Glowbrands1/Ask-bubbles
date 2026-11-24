import { expect, vi } from "vitest";

import { activePermissionMatrix, hasPermission, setActivePermissionOverrides } from "@/lib/permissions";
import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A SAVED PERMISSION CHANGE REACHES THE CHAT (Pau, 23 Nov 2026)
 * ============================================================================
 *
 * The Permissions screen now saves to the database and the server enforces it
 * (`permission_overrides`; `activePermissionMatrix()`). Not a manager's report but the same invariant the pack exists
 * for: the chat route and the tool loop must read the gated data only for a role that holds the permission IN FORCE —
 * so an administrator unticking "View reports" for Location Manager takes the Google review figures out of the chat for
 * them, on the path production takes.
 *
 * The harness's login stand-in checks the active matrix, as `authorizeRequest` does. Each case clears the saved change
 * when it ends.
 */

const QUESTION = "How many Google reviews did we get this week?";
const REPORT = "Pau, 23 Nov 2026: the Permissions screen saves, and the server enforces what is ticked";
// A Location Manager with "View reports" unticked: everything else as saved.
const UNTICKED = { location_manager: ["ask_questions", "view_knowledge", "view_ai_training"] };

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV23_PERMISSION_OVERRIDE_CASES: ReplayCase[] = [
  {
    id: "nov23-permission-override-removes-reviews-from-chat",
    title: `"${QUESTION}": with "View reports" unticked for Location Manager, the model is given no review figures; ticked, it is`,
    report: REPORT,
    status: "fixed",
    fixFlags: ["GOOGLE_REVIEWS_IN_CHAT_ENABLED"],
    async run(t) {
      try {
        await start(t).say(QUESTION);
        const control = t.lastReportData?.() ?? "";
        expect(control, "control: the defaults give a Location Manager the review figures").toContain("All 7 stores together");

        setActivePermissionOverrides(UNTICKED);
        expect(hasPermission(activePermissionMatrix(), "location_manager", "view_reports")).toBe(false);
        await start(t).say(QUESTION);
        const data = t.lastReportData?.() ?? "";
        expect(data, "a Location Manager whose permission was unticked was still given review figures").not.toContain("All 7 stores together");
        expect(data).not.toMatch(/this week \d+ reviews/);
        expect(data).toContain("This account's role does not include View reports. No review figures were read.");
      } finally {
        setActivePermissionOverrides({});
      }
    },
  },
  {
    id: "nov23-permission-override-removes-reviews-from-agent-loop",
    title: `the tool loop: "${QUESTION}": read_reviews gives no figures to a role whose "View reports" was unticked`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      try {
        setActivePermissionOverrides(UNTICKED);
        const thread = start(t);
        const model = loopStandIn((view: LoopView) => (lastResult(view, "read_reviews") ? { text: "Here is what the app shows." } : { tool: "read_reviews", input: {} }));
        t.loopModel!(model);
        await thread.say(QUESTION);
        const seen = JSON.stringify(model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_reviews")).at(-1)?.output ?? {});
        expect(seen, "read_reviews was never reached").toContain("does not include View reports");
        expect(seen, "read_reviews gave figures to a role whose permission was unticked").not.toContain("All 7 stores together");
      } finally {
        setActivePermissionOverrides({});
      }
    },
  },
];
