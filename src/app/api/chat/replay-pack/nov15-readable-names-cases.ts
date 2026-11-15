import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * NAMES READ AS THEY ARE WRITTEN, AND FOUND HOWEVER THEY ARE TYPED (READABLE_NAMES_ENABLED)
 * ============================================================================
 *
 * Pau, 15 Nov 2026 (via QA): "all naming conventions should be readable; some have de la Torre etc." A name typed off
 * the roster was cut at its particle ("jacinta van") and kept as typed, and a roster surname with spaces was not found
 * when typed without them ("maria delatorre"). With the flag: the typed name is whole and readable on the card, and the
 * roster's spelling is found from the squashed one. Port of Ask Sunny's cases (its agent-loop cases have no
 * counterpart here). Every person is invented (on no directory).
 */

const MARIA: DirectoryRow = { id: "e-maria-delatorre-rn", firstName: "Maria", lastName: "de la Torre", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
/** QA, 15 Nov 2026: the typed first name was the employee's preferred first name in Woven (invented here). */
const LORRAINE: DirectoryRow = { id: "e-lorraine-fairweather-rn", firstName: "Lorraine", lastName: "Fairweather", preferredFirstName: "Rae", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const PREFERRED_REPORT = "QA, 15 Nov 2026: the manager typed the preferred first name, and the card showed only the legal name; Pau (~10:20 PHT): the card and form use the name the manager used, and the reply names the legal name once";
const REPORT = "Pau via QA, 15 Nov 2026: \"all naming conventions should be readable; some have de la Torre etc.\"";
const FLAG = "READABLE_NAMES_ENABLED";

export const NOV15_READABLE_NAMES_CASES: ReplayCase[] = [
  {
    id: "nov15-readable-names-squashed-surname",
    title: "\"create a ca for maria delatorre, she was late on 11/12\": the surname typed without its spaces is the roster's Maria de la Torre",
    report: REPORT,
    // Already so with the flag off: the close-spelling check asks "Is this for **Maria de la Torre**?". With the flag the
    // matcher reads the squashed surname as hers outright (readable-name.test.ts); this app's card still asks once.
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MARIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a ca for maria delatorre, she was late on 11/12", { employeeName: "maria delatorre" });
      expect(`${thread.proposal?.employeeName ?? ""} ${reply.content}`).toContain("Maria de la Torre");
      expect(reply.content).not.toMatch(/maria delatorre/i);
    },
  },
  {
    id: "nov15-readable-names-typed-off-roster",
    title: "\"create a ca for jacinta van der berg, she was late on 11/12\" (not on the roster): the card's name is \"Jacinta van der Berg\"",
    report: REPORT,
    status: { open: "the name is cut at its particle (\"jacinta van\")" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, MARIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      let reply = await thread.say("create a ca for jacinta van der berg, she was late on 11/12", { employeeName: "jacinta van der berg" });
      // The card asks who the form is for, or offers the name as typed; the answer is the name alone, then "use <name>".
      if (!thread.proposal?.employeeName) reply = await thread.say("jacinta van der berg", { employeeName: "jacinta van der berg" });
      if (!thread.proposal?.employeeName && /reply \*\*use /.test(reply.content)) reply = await thread.say("use jacinta van der berg", { employeeName: "jacinta van der berg" });
      expect(thread.proposal?.employeeName, reply.content).toBe("Jacinta van der Berg");
    },
  },
  {
    id: "nov15-readable-names-preferred-name-said-back",
    title: "\"Create a CA for Rae Fairweather, she was late on 11/12\" (Lorraine, preferred Rae): the card is Rae Fairweather, and the reply names Lorraine Fairweather in Woven once",
    report: PREFERRED_REPORT,
    status: { open: "the reply and card show only the legal name, so it looks like another person" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, LORRAINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Rae Fairweather, she was late on 11/12", { employeeName: "Rae Fairweather" });
      expect(thread.proposal?.employeeName, reply.content).toBe("Rae Fairweather");
      expect(reply.content).toContain("**Rae Fairweather** (Lorraine Fairweather in Woven)");
      expect(reply.content.split("Lorraine Fairweather").length - 1, "the legal name is said once").toBe(1);
    },
  },
  {
    id: "nov15-readable-names-preferred-name-saved",
    title: "Pau's ruling: the preferred name the manager typed IS the saved employee_name, for the same roster person",
    report: PREFERRED_REPORT,
    status: { open: "the form is saved under the legal name" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, LORRAINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Create a CA for Rae Fairweather, she was late on 11/12", { employeeName: "Rae Fairweather" });
      const id = await thread.createCard!(thread.proposal?.employeeName ?? "");
      const form = t.forms().find((row) => row.id === id);
      expect(form?.employee_name).toBe("Rae Fairweather");
      expect(JSON.stringify(form)).not.toMatch(/Lorraine/);
    },
  },
  {
    id: "nov15-readable-names-legal-name-kept",
    title: "\"Create a CA for Lorraine Fairweather, she was late on 11/12\": the legal name typed is the card's and the form's, with no note",
    report: PREFERRED_REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory([...STAFF, LORRAINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Create a CA for Lorraine Fairweather, she was late on 11/12", { employeeName: "Lorraine Fairweather" });
      expect(thread.proposal?.employeeName, reply.content).toBe("Lorraine Fairweather");
      expect(reply.content).not.toContain("in Woven)");
    },
  },
  ...([
    ["saved-preferred-asked-legal", "Rae Fairweather", "open the CA for Lorraine Fairweather"],
    ["saved-legal-asked-preferred", "Lorraine Fairweather", "open the CA for Rae Fairweather"],
  ] as const).map(
    ([slug, savedAs, asked]): ReplayCase => ({
      id: `nov15-readable-names-lookup-${slug}`,
      title: `A CA saved as "${savedAs}" is found by "${asked}": one roster person, two names`,
      report: "QA, 15 Nov 2026: form_instances holds only employee_name; every by-name lookup reads the preferred and legal names as one person",
      status: { open: "the form saved under the other name is not found" },
      fixFlags: [FLAG, "REOPEN_BY_ANY_OPEN_VERB_ENABLED"],
      async run(t) {
        vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
        t.directory([...STAFF, LORRAINE]);
        t.as("location_manager", WEST_DODGE);
        const id = await caSavedAs(t, savedAs);
        const reply = await t.thread().say(asked);
        const opened = reply.formOpened as { instanceId: string; revisesInstanceId?: string | null } | undefined;
        expect([opened?.instanceId, opened?.revisesInstanceId], reply.content).toContain(id);
      },
    }),
  ),
];

/** A Corrective Action saved under one of the person's names, in an earlier chat. */
async function caSavedAs(t: ReplayContext, name: string): Promise<string> {
  const earlier = t.thread();
  await earlier.say(`I need a corrective action for ${name}, she was late opening the store on Monday`, { employeeName: name });
  t.draftWrites({ observation: "Observed:\nShe opened the store late on Monday." });
  const id = await earlier.create();
  const row = t.forms().find((form) => form.id === id);
  if (row) row.employee_name = name;
  return id;
}
