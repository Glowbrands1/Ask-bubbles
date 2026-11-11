import { expect } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE OBSERVATION NEVER HOLDS THE REQUEST'S OTHER PEOPLE OR THE MANAGER'S COMMAND (QA's P7 in the sibling app, live on its
 * 13b chat code, 10 Nov 2026; a guard here)
 * ============================================================================
 *
 * "Make me a coaching form for <A>, <B>, and <C> for not closing duties correctly" (<A> a first name two people share)
 * → "Did you mean <A> <s1> or <A> <s2>?" → "create draft for failure to do closing duties and staying over hours" gave
 * ONE card whose Observation was "<B>, and <C> for not closing duties correctly create draft for failure to do closing
 * duties and staying over hours". Here the second turn asks again which Tamsin and makes no card; this case keeps it
 * so. The people are invented.
 */
const row = (id: string, firstName: string, lastName: string): DirectoryRow => ({ id, firstName, lastName, preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" });
const PEOPLE = [row("p7-tamsin-rookwood", "Tamsin", "Rookwood"), row("p7-tamsin-ashby", "Tamsin", "Ashby"), row("p7-corwin-halsey", "Corwin", "Halsey"), row("p7-ione-marchetti", "Ione", "Marchetti")];

export const NOV10_OBSERVATION_OWN_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov10-observation-own-person-p7",
    title: "\"Make me a coaching form for Tamsin, Corwin, and Ione …\" → \"create draft for …\": the Observation holds neither Corwin, Ione nor \"create draft\"",
    report: "QA's P7 in the sibling app (10 Nov 2026): the Observation was \"<B>, and <C> for not closing duties correctly create draft for failure to do closing duties and staying over hours\"",
    // Holds with production's flags here (10 Nov 2026): the sibling app's bug is not in this app (docs/parity-log).
    status: "fixed",
    async run(t) {
      t.directory([...STAFF, ...PEOPLE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Make me a coaching form for Tamsin, Corwin, and Ione for not closing duties correctly");
      const reply = await thread.say("create draft for failure to do closing duties and staying over hours");
      // Here the second turn asks again which Tamsin and makes no card (checked 10 Nov 2026): no Observation to go wrong.
      expect(reply.content, `the question which Tamsin is not asked again:\n${reply.content}`).toMatch(/Did you mean \*\*Tamsin \w+\*\* or \*\*Tamsin \w+\*\*/);
      expect(thread.proposal?.employeeName ?? null, `a card picked one of the two Tamsins unasked:\n${reply.content}`).toBeNull();
      const observation = /\*\*Observation of Offense:\*\*\s*(.+)/.exec(reply.content)?.[1] ?? "";
      expect(observation, `the Observation names the request's other people:\n${reply.content}`).not.toMatch(/\bCorwin\b|\bIone\b/);
      expect(observation, `the Observation holds the manager's command:\n${reply.content}`).not.toMatch(/\bcreate draft\b/i);
    },
  },
];
