import { expect, vi } from "vitest";

import { STAFF, TWO_STORES, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * TWO PEOPLE WITH ONE NAME AT ONE STORE ARE A NUMBERED CHOICE (QA, 12 Nov 2026)
 * ============================================================================
 *
 * The sibling app's high-priority finding (two same-named people resolved to one,
 * with one of them's title) checked here: this app does not choose silently, but
 * with two Marnie Holloways at ONE store it asked "Which store is the one you
 * mean?" — the store cannot tell them apart — and then "Who is this form for?".
 * SAME_NAME_ASKS_WHICH_ENABLED asks a numbered choice labelled with store and job
 * title, and the number, the job title, or (for two stores) the store selects that
 * person by identity, never by name. The second Marnie Holloway is invented, as
 * the first is.
 */

const SECOND_MARNIE: DirectoryRow = {
  id: "e-90",
  firstName: "Marnie",
  lastName: "Holloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Assistant General Manager",
};

const SAID = "verbal CA for marnie holloway, she was late on 11/1/26";
const ASKED = /Did you mean[\s\S]*Marnie Holloway/;
/** Each option of the choice: its number and its label (store, then job title). A store label may hold parentheses. */
const options = (content: string) =>
  [...content.matchAll(/(\d+)\. \*\*Marnie Holloway\*\* \((.+?)\)(?= or \d+\. \*\*|\?)/g)].map((match) => ({ number: match[1]!, label: match[2]! }));

function start(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-11-03T15:00:00Z"));
  t.directory([...STAFF, SECOND_MARNIE]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV12_SAME_NAME_ASKS_WHICH_CASES: ReplayCase[] = [
  {
    id: "nov12-same-name-asks-which",
    title: `"${SAID}" with two Marnie Holloways at one store: a numbered choice with both titles, not "Which store?"`,
    report: "QA, 12 Nov 2026: two people with one name at one store were asked which store, which cannot tell them apart",
    status: { open: "two Marnie Holloways at one store are asked \"Which store is the one you mean?\"" },
    fixFlags: ["SAME_NAME_ASKS_WHICH_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID);
      expect(reply.content, `no numbered choice:\n${reply.content}`).toMatch(ASKED);
      expect(reply.content, `the choice does not show both titles:\n${reply.content}`).toMatch(/1\.[\s\S]*\(.*(?:Team Member Part Time|Assistant General Manager)[\s\S]*2\./);
      expect(reply.content, `asked which store:\n${reply.content}`).not.toMatch(/Which store is the one you mean/);
      expect(reply.content, `asked who the form is for:\n${reply.content}`).not.toMatch(/Who is this form for\?/);
    },
  },
  {
    id: "nov12-same-name-numbered-reply-selects",
    title: `"${SAID}" with two Marnie Holloways at one store, then the Assistant General Manager's number: that person's card`,
    report: "QA, 12 Nov 2026: the numbered reply to the same-name choice selects that person by identity",
    status: { open: "two Marnie Holloways at one store get no numbered choice to answer" },
    fixFlags: ["SAME_NAME_ASKS_WHICH_ENABLED"],
    async run(t) {
      const thread = start(t);
      const asked = await thread.say(SAID);
      const choice = options(asked.content).find((option) => option.label.endsWith("Assistant General Manager"));
      expect(choice, `no numbered choice for the Assistant General Manager:\n${asked.content}`).toBeTruthy();
      const reply = await thread.say(choice!.number);
      expect(reply.content, `asked again after the number:\n${reply.content}`).not.toMatch(/Did you mean|Which store is the one you mean/);
      expect(thread.proposal, "not the Assistant General Manager's card").toMatchObject({ employeeName: "Marnie Holloway", employeeRole: "Assistant General Manager" });
    },
  },
  {
    id: "nov12-same-name-title-reply-selects",
    title: `"${SAID}" with two Marnie Holloways at one store, then "the assistant general manager": that person's card`,
    report: "QA, 12 Nov 2026: the job-title reply to the same-name choice selects that person by identity",
    status: { open: "two Marnie Holloways at one store get no numbered choice to answer" },
    fixFlags: ["SAME_NAME_ASKS_WHICH_ENABLED"],
    async run(t) {
      const thread = start(t);
      const asked = await thread.say(SAID);
      expect(asked.content, `no numbered choice:\n${asked.content}`).toMatch(ASKED);
      const reply = await thread.say("the assistant general manager");
      expect(reply.content, `asked again after the title:\n${reply.content}`).not.toMatch(/Did you mean|Which store is the one you mean/);
      expect(thread.proposal, "not the Assistant General Manager's card").toMatchObject({ employeeName: "Marnie Holloway", employeeRole: "Assistant General Manager" });
    },
  },
  {
    id: "nov12-same-name-store-reply-selects",
    title: `two Team Members named Marnie Holloway at two stores, then the other store's name: that person's card`,
    report: "QA, 12 Nov 2026: the store reply to the same-name choice selects that person by identity",
    status: { open: "two Marnie Holloways at two stores get the store question, not the numbered choice" },
    fixFlags: ["SAME_NAME_ASKS_WHICH_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-03T15:00:00Z"));
      const other: DirectoryRow = { ...SECOND_MARNIE, id: "e-91", locationIds: ["loc-67"], positionName: "Team Member Part Time" };
      t.directory([...STAFF, other]);
      t.as("location_manager", TWO_STORES);
      const thread = t.thread();
      const asked = await thread.say(SAID);
      expect(asked.content, `no numbered choice:\n${asked.content}`).toMatch(ASKED);
      // The store is the label before its last ", <job title>".
      const labels = options(asked.content).map((option) => option.label.replace(/, [^,]+$/, ""));
      expect(new Set(labels).size, `the choice does not name two stores:\n${asked.content}`).toBe(2);
      const otherStore = labels.find((label) => !/Dodge/i.test(label));
      expect(otherStore, `no store other than West Dodge:\n${asked.content}`).toBeTruthy();
      const reply = await thread.say(otherStore!);
      expect(reply.content, `asked again after the store:\n${reply.content}`).not.toMatch(/Did you mean|Which store is the one you mean/);
      expect(thread.proposal, "not the card of the Marnie Holloway at that store").toMatchObject({ employeeName: "Marnie Holloway", locationId: "loc-67" });
    },
  },
];
