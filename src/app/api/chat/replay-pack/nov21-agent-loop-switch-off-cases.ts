import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { loopStandIn } from "./loop-stand-in";

/**
 * ============================================================================
 * THE LOOP'S SWITCH-OFF, AT RUN TIME (the loop port, QA 21 Nov 2026; ported from the sibling app's QA audit of 15 Nov)
 * ============================================================================
 *
 * "Everything stays behind AGENT_LOOP_ENABLED + AGENT_LOOP_USERS." This app's production runs the loop for nobody yet,
 * so the switch-off is what every manager gets. With AGENT_LOOP_ENABLED off, and with it on but AGENT_LOOP_USERS unset,
 * empty or not listing the signed-in manager, the chat route never enters the loop's run module (`runAgentTurn`,
 * watched through `watchLoopEntries`), the loop's model is never called, and a fixed set of requests gets the same
 * replies as today's path. The control: the manager listed, the loop answers (so the spy and the stand-in work).
 * Mechanism only; the requests are in this app's words, every person invented.
 */

const REPORT = "QA, 21 Nov 2026 (the loop port): the loop's switch-off must leave every turn on today's path";

const REQUESTS = [
  "create corrective action for Fenna Prewitt, she was late on 11/10",
  "ca for ozren brack",
  "what forms does Fenna Prewitt have on file",
  "what is the policy on breaks",
] as const;

const NAMES = ["AGENT_LOOP_ENABLED", "AGENT_LOOP_USERS"] as const;

interface Outcome {
  readonly reply: string;
  readonly card: string | null;
}

const shape = (answer: ReplayAnswer): Outcome => ({
  reply: answer.content,
  card: answer.formProposal ? JSON.stringify({ templateKey: answer.formProposal.templateKey, employeeName: answer.formProposal.employeeName, status: answer.formProposal.status }) : null,
});

/** The fixed requests, each in a fresh thread, with the loop's entry point watched and the two switches as given. */
async function ask(t: ReplayContext, env: { enabled: string | undefined; users: string | undefined }): Promise<{ outcomes: Outcome[]; entered: number }> {
  const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  const watch = t.watchLoopEntries!();
  try {
    for (const [name, value] of [["AGENT_LOOP_ENABLED", env.enabled], ["AGENT_LOOP_USERS", env.users]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const outcomes: Outcome[] = [];
    for (const request of REQUESTS) outcomes.push(shape(await t.thread().say(request)));
    return { outcomes, entered: watch.entered() };
  } finally {
    watch.stop();
    for (const name of NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}

function setup(t: ReplayContext): void {
  vi.setSystemTime(new Date("2026-11-13T22:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

export const NOV21_AGENT_LOOP_SWITCH_OFF_CASES: ReplayCase[] = [
  {
    id: "nov21-loop-switch-off-never-enters-the-loop",
    title: "AGENT_LOOP_ENABLED off, and on with AGENT_LOOP_USERS unset, empty or not listing the manager: the route never enters the loop, its model is never called, and every request gets the same reply as today's path",
    report: `${REPORT}; fixed requests: a Corrective Action, a short form request, a forms-on-file question and a policy question`,
    status: "fixed",
    async run(t) {
      setup(t);
      // A stand-in is set (as for a loop case), so a turn that reached the loop's model would be counted.
      const standIn = loopStandIn(() => ({ text: "Noted." }));
      t.loopModel!(standIn);
      const off = await ask(t, { enabled: undefined, users: "qa-manager@example.test" });
      expect(off.entered, "the loop was entered with AGENT_LOOP_ENABLED unset").toBe(0);
      const states: Record<string, { enabled: string | undefined; users: string | undefined }> = {
        "enabled false": { enabled: "false", users: "qa-manager@example.test" },
        "on, users unset": { enabled: "true", users: undefined },
        "on, users empty": { enabled: "true", users: "" },
        "on, users list someone else": { enabled: "true", users: "someone.else@example.test" },
        "on, users list the manager only by prefix": { enabled: "true", users: "qa-manager" },
        "on, a star mixed with emails": { enabled: "true", users: "*,someone.else@example.test" },
      };
      for (const [label, env] of Object.entries(states)) {
        const run = await ask(t, env);
        expect(run.entered, `the loop was entered: ${label}`).toBe(0);
        expect(run.outcomes, `a different reply from today's path: ${label}`).toEqual(off.outcomes);
      }
      expect(standIn.calls, "the loop's model was called with the loop switched off").toBe(0);
    },
  },
  {
    id: "nov21-loop-switch-off-control-listed-manager-enters-the-loop",
    title: "control for the switch-off case: with the loop on and the manager listed, the route enters the loop on every request and the loop's model answers (so the spy and the stand-in would see a leak)",
    report: `${REPORT}; the spy on runAgentTurn is live`,
    status: "fixed",
    async run(t) {
      setup(t);
      const standIn = loopStandIn(() => ({ text: "Noted." }));
      t.loopModel!(standIn);
      expect(t.loopOn!(), "t.loopModel did not turn the loop on for this case").toBe(true);
      const listed = await ask(t, { enabled: "true", users: "qa-manager@example.test" });
      expect(listed.entered, "the loop was not entered for a listed manager").toBe(REQUESTS.length);
      expect(standIn.calls, "the loop's model was not called for a listed manager").toBeGreaterThanOrEqual(REQUESTS.length);
    },
  },
];
