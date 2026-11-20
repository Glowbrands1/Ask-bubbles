import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * COACHING FOR EVERYONE (port from the sibling app: QA's code audit of coach_team / coaching for everyone, 20 Nov 2026)
 * ============================================================================
 *
 * The same code in this app: `coaching-for-everyone.ts` and `swapName`.
 * A. "Create all" from the team card put a first name where "All" was ("All guests…" → "<First> guests…").
 * B. A failed draft in "create all" took the whole turn down; the retry listed the empty drafts as "already made".
 * C. Ordinary answers to "create all?" ("yes please", "go ahead and make them") went nowhere.
 * D. "Do this coaching for the whole team" with one person's Coaching draft open was not read as for everyone.
 * Through the real chat route with production's flags. Invented names only (STAFF's people).
 */
const REPORT = "The sibling app's QA code audit of coaching for everyone (20 Nov 2026), ported";

/** The team Coaching card, created with `details`; the thread has it open. */
async function teamDraft(t: ReplayContext, details: string) {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say("Create a coaching form.");
  await thread.say("for the whole store");
  expect(thread.proposal).toMatchObject({ templateKey: "coaching", subject: "team" });
  t.draftWrites({ coaching_details: details });
  await thread.create();
  return thread;
}

const DETAILS = "All guests must be greeted at the door. Everyone restocks the soap shelf before close.";

async function confirmation(t: ReplayContext, thread: Awaited<ReturnType<typeof teamDraft>>, ask = "Create this coaching form for everyone on my team") {
  const confirm = await thread.say(ask);
  const count = Number(/create all (\d+)/.exec(confirm.content)?.[1] ?? 0);
  expect(count, confirm.content).toBeGreaterThan(0);
  return count;
}

export const NOV20_COACHING_FOR_EVERYONE_CASES: readonly ReplayCase[] = [
  {
    id: "nov20-coaching-for-everyone-a-all-is-not-a-name",
    title: "A: \"create all\" from the team card keeps \"All guests must be greeted…\"; only \"All team members\" is swapped",
    report: `${REPORT}, item A`,
    status: "fixed",
    async run(t) {
      const thread = await teamDraft(t, DETAILS);
      const before = t.forms().length;
      const count = await confirmation(t, thread);
      await thread.say(`create all ${count}`);
      const made = t.forms().slice(before);
      expect(made.length, "not one draft per person").toBe(count);
      for (const form of made) {
        const details = t.values(String(form.id)).coaching_details ?? "";
        const first = String(form.employee_name).split(" ")[0];
        expect(details, details).toContain("All guests must be greeted at the door.");
        expect(details, details).not.toMatch(new RegExp(`\\b${first} guests|\\bMembers\\b`));
      }
    },
  },
  {
    id: "nov20-coaching-for-everyone-b-failure-named-and-retried",
    title: "B: a draft that fails in \"create all\" is named as not made, and the retry fills it instead of listing it as already made",
    report: `${REPORT}, item B`,
    status: "fixed",
    async run(t) {
      const thread = await teamDraft(t, DETAILS);
      const before = t.forms().length;
      const count = await confirmation(t, thread);
      t.failSavesOf!("coaching_details");
      const failed = await thread.say(`create all ${count}`);
      expect(failed.content, "the failed drafts were not named").toMatch(/Not made: \*\*/);
      expect(failed.content, "a failed draft was reported as created").not.toMatch(/Created \*\*/);
      t.failSavesOf!("");
      const retried = await thread.say(`create all ${count}`);
      expect(retried.content, "the empty drafts were listed as already made").not.toMatch(/Already made/);
      expect(retried.content).toMatch(new RegExp(`Created \\*\\*${count}\\*\\* draft Coaching Form`));
      for (const form of t.forms().slice(before)) expect(t.values(String(form.id)).coaching_details ?? "").toContain("All guests must be greeted");
    },
  },
  {
    id: "nov20-coaching-for-everyone-c-go-ahead-and-make-them",
    title: "C: \"go ahead and make them\" answers the \"create all\" confirmation",
    report: `${REPORT}, item C`,
    status: "fixed",
    async run(t) {
      const thread = await teamDraft(t, DETAILS);
      const before = t.forms().length;
      const count = await confirmation(t, thread);
      const made = await thread.say("go ahead and make them");
      expect(made.content).toMatch(/Created \*\*\d+\*\* draft Coaching Form/);
      expect(t.forms().length - before).toBe(count);
    },
  },
  {
    id: "nov20-coaching-for-everyone-d-whole-team",
    title: "D: \"Do this coaching for the whole team\" with a Coaching draft open asks to make one draft each",
    report: `${REPORT}, item D`,
    status: "fixed",
    async run(t) {
      const thread = await teamDraft(t, DETAILS);
      const reply = await thread.say("Do this coaching for the whole team");
      expect(reply.content, "no one-draft-each confirmation").toMatch(/Reply \*\*create all \d+\*\*/);
    },
  },
];
