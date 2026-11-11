import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

const WITH_KESTRELSON = [
  ...STAFF,
  { id: "e-kestrelson", firstName: "Rowan", lastName: "Kestrelson", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

/** Pau, 3 Nov 2026: a Corrective Action's name is correctable from the chat. Invented people. */
export const NOV3_CA_NAME_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-ca-name-from-chat",
    title: "\"fix her last name …\" on a Corrective Action changes the Employee Name, and says so",
    report: '"fix her last name …" on a Corrective Action: "The name on a Corrective Action Form isn\'t changed from the chat" (Pau: it should change)',
    // Fixed in production: CA_NAME_FROM_CHAT on (QA, 3 Nov 2026).
    status: "fixed",
    fixFlags: ["CA_NAME_FROM_CHAT_ENABLED"],
    async run(t) {
      t.directory(WITH_KESTRELSON);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a CA for Rowan Kestrel for being late to opening this morning");
      expect(thread.proposal?.employeeName).toBe("Rowan Kestrel");
      t.draftWrites({ observation: "Rowan was late to opening this morning." });
      const id = await thread.create();
      const reply = await thread.say("fix her last name Kestrelson");
      expect(t.values(id).employee_name, "the Employee Name line").toBe("Rowan Kestrelson");
      expect(t.forms().find((row) => row.id === id)?.employee_name, "the form's subject line").toBe("Rowan Kestrelson");
      expect(reply.formUpdate?.updated ?? []).toContain("employee_name");
      expect(reply.content).toMatch(/Rowan Kestrelson/);
    },
  },
  {
    id: "nov3-ca-name-not-on-roster",
    title: "a surname nobody on the roster has changes nothing, and the reply says so",
    report: "Pau, 3 Nov 2026: a different person's name is never written (roster-confirmed only)",
    status: "fixed",
    fixFlags: ["CA_NAME_FROM_CHAT_ENABLED"],
    async run(t) {
      t.directory(WITH_KESTRELSON);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a CA for Rowan Kestrel for being late to opening this morning");
      t.draftWrites({ observation: "Rowan was late to opening this morning." });
      const id = await thread.create();
      const reply = await thread.say("fix her last name Okonkwo");
      expect(t.values(id).employee_name).toBe("Rowan Kestrel");
      expect(reply.formUpdate).toBeUndefined();
      expect(reply.content).toMatch(/Nothing on the form has changed|haven't changed/);
    },
  },
];
