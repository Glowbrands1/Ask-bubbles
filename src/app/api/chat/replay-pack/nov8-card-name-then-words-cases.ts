import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * sf-s38 (3'): THE CARD AND THE SAVED FORM WERE FOR "<A> MISSING" (QA, 8 Nov 2026; the sibling app's production wording)
 * ============================================================================
 *
 * The sibling app's sf-s38 (QA checked the wording against its DB), the employee swapped for an invented one (the
 * pack's STAFF): "make me an CA for <A> missing her saturday and sunday shifts due to wanting to go home for the
 * weekend but failed to communicate proporley". Here (main e7a7ba9, production's flags plus flips 6 and 8) the card was
 * for "Rowan Kestrel missing" and Create saved the form under that name; so for "<A> failing …", and for "<a> missing
 * …" typed in lower case. "not showing up" and "being late" were right (guards). QA checked both DBs: no saved form has
 * such a name yet. CARD_NAME_THEN_WORDS_CURRENT_ENABLED.
 */
const FIX = ["CARD_NAME_THEN_WORDS_CURRENT_ENABLED"];
const REPORT = "QA's sf-s38 (3'), 8 Nov 2026 (the sibling app's production wording): the card and the saved form were for <A> missing";

async function createFor(t: ReplayContext, said: string) {
  vi.setSystemTime(new Date("2026-11-07T16:14:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(said);
  expect(thread.proposal, `no Corrective Action card:\n${said}`).toMatchObject({ templateKey: "dpoa", employeeName: "Rowan Kestrel" });
  t.draftWrites({ observation: "Observed:\nRowan Kestrel missed her scheduled shifts and did not communicate it." });
  const id = await thread.create();
  expect(t.values(id).employee_name ?? "", "the saved form's employee").toBe("Rowan Kestrel");
}

const SHAPES: { key: string; said: string; status: ReplayCase["status"] }[] = [
  {
    key: "t1-missing",
    said: "make me an CA for Rowan Kestrel missing her saturday and sunday shifts due to wanting to go home for the weekend but failed to communicate proporley",
    status: { open: "the card, and the saved form, are for \"Rowan Kestrel missing\"" },
  },
  {
    key: "failing",
    said: "make me a CA for Rowan Kestrel failing to show up for her saturday shift",
    status: { open: "the card, and the saved form, are for \"Rowan Kestrel failing\"" },
  },
  {
    key: "lower-case-missing",
    said: "make me a CA for rowan kestrel missing her shift on 11/7",
    status: { open: "the card, and the saved form, are for \"rowan kestrel missing\"" },
  },
  {
    key: "not-showing-up",
    said: "Make me a CA for Rowan Kestrel not showing up to her shifts on  11/7 and 11/8",
    status: "fixed",
  },
  {
    key: "being-late",
    said: "make me a CA for Rowan Kestrel being late to her shift on 11/7",
    status: "fixed",
  },
];

export const NOV8_CARD_NAME_THEN_WORDS_CASES: ReplayCase[] = SHAPES.map(({ key, said, status }) => ({
  id: `nov8-card-name-then-words-${key}`,
  title: `sf-s38 (3) "${said.slice(0, 60)}…" → Create: the form is for Rowan Kestrel`,
  report: REPORT,
  status,
  fixFlags: FIX,
  run: (t) => createFor(t, said),
}));
