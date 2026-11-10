import { formEditToolInStreamEnabled } from "@/lib/config/chat-quality-flags";
import { expect, vi } from "vitest";

import { PAYROLL_DEDUCT_AMOUNT_QUESTION } from "@/lib/forms/payroll-deduct-amount";

import { STAFF, WEST_DODGE, replyMatchesDiff, savedForm, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayThread } from "./cases";

/*
 * STEP B'S OPEN CASES (3 Nov 2026). One form-update path is coming
 * (FORM_PATCH_REDUCER_ENABLED + FORM_REPLY_FROM_DIFF_ENABLED): what the manager
 * says in chat reaches the open draft's fields, a typed field is never blanked,
 * a redraft merges, payroll and dates go in exactly as given, and the reply
 * about the form comes only from what really changed. Each case below is a
 * reported chat in the reporter's words (people invented) and asserts that
 * invariant on what is SAVED and what is CLAIMED. All stay open in
 * production (the flags are off there); with Step B's two flags on, every
 * case but the date case must hold (`fixFlags`).
 *
 * THE FORM-PATCH MODEL IS SCRIPTED (`t.patchWrites`): its raw output for each
 * call, in order, with the manager's own words as the evidence. A call past
 * the script falls back, and that turn runs on the old path. The zod parse,
 * the evidence checks, the reducer, the writes and the reload are real.
 *
 * The drafting and revision models are left at the pack's defaults (they
 * write nothing) unless a case says otherwise. That is what production did in
 * these reports: the drafting model was never handed the details (its prompt
 * held only the turns before the card), and the revision model wrote nothing
 * the manager asked for.
 */

const PEOPLE: DirectoryRow[] = [
  ...STAFF,
  { id: "b13-bryony", firstName: "Bryony", lastName: "Castellane", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "b13-tamsin", firstName: "Tamsin", lastName: "Rookwood", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "b17-rosalind", firstName: "Rosalind", lastName: "Ashgrove", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "live-odile", firstName: "Odile", lastName: "Farrant", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "live-brennick", firstName: "Brennick", lastName: "Halloran", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Full Time" },
  { id: "live-brennick-2", firstName: "Brennick", lastName: "Ostrander", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "hr-pat", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

/**
 * One turn on the open draft: the reply may say the form changed only when the
 * saved values (text or ticked options) did change — `replyMatchesDiff`.
 */
async function turnOnDraft(t: Parameters<ReplayCase["run"]>[0], thread: ReplayThread, id: string, text: string): Promise<ReplayAnswer> {
  const before = savedForm(t, id);
  const reply = await thread.say(text);
  replyMatchesDiff(t, id, before, reply, text);
  return reply;
}

/** One scripted form-patch output: what the latest message is, and what it adds to each field, in the manager's words. */
function patchOutput(turn: "this_form" | "question" | "other", set: readonly { field: string; value: string; how?: "add" | "replace"; evidence?: string }[] = []) {
  return {
    turn,
    set: set.map((entry) => ({ field: entry.field, value: entry.value, how: entry.how ?? "add", evidence: entry.evidence ?? entry.value })),
    clear: [],
  };
}

/** Every way a date can be written on a form: 10-1-26, 10/01/2026, 2026-10-01, October 1, 2026, Oct 1. */
const DATE_SHAPES =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi;
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "10-1-26" → "10-01"; "2026-10-01" → "10-01"; "October 1, 2026" → "10-01" (month and day only; the year is checked by the Date field). */
function monthDay(text: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return `${iso[2]}-${iso[3]}`;
  const numeric = /^(\d{1,2})[-/](\d{1,2})/.exec(text);
  if (numeric) return `${numeric[1]!.padStart(2, "0")}-${numeric[2]!.padStart(2, "0")}`;
  const named = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})/i.exec(text);
  const month = named ? MONTH_NAMES.indexOf(named[1]!.toLowerCase()) : -1;
  return month < 0 ? null : `${String(month + 1).padStart(2, "0")}-${named![2]!.padStart(2, "0")}`;
}

/** Step B's two flags, both on: the fix this file's cases are run with. */
const STEP_B_FLAGS = ["FORM_PATCH_REDUCER_ENABLED", "FORM_REPLY_FROM_DIFF_ENABLED"];

export const NOV3_STEP_B_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-stepb-b13-rolling-rack",
    title: "\"ok, create the draft, but include the details of rolling rack.\" — the copied draft holds the rolling-rack details she gave",
    report:
      'replay set b13 (Location Manager, West Dodge Rd, rated 2): "can you create the same draft that we did with bryony castellane by changing the name and position?" → "ok, create the draft, but include the details of rolling rack." — the new draft had none of the details',
    // Was open in production ("the copied draft's Details of Coaching is empty: the drafting model is handed only \"Do the same coaching form for tamsin rookwood\", not the rolling-rack details given earlier"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const details =
        "this is what i am wanting to coach on: managing our ship from store operation, here are the details of the process: print packing slip, use rolling rack and use clips to pin them in order of first come first serve. Pick and customize products, pack, once the order is ready, then print shipping label to tape on box.";
      const process =
        "print packing slip, use rolling rack and use clips to pin them in order of first come first serve. Pick and customize products, pack, once the order is ready, then print shipping label to tape on box.";
      t.patchWrites([
        // The details she gave, on Bryony's open draft.
        patchOutput("this_form", [{ field: "coaching_details", value: process }]),
        // "add details about the rolling rack": the rolling-rack step, already there.
        patchOutput("this_form", [{ field: "coaching_details", value: "use rolling rack and use clips to pin them in order of first come first serve" }]),
        // Tamsin, and copying Bryony's draft: another person, not this form.
        patchOutput("other"),
        patchOutput("other"),
        patchOutput("other"),
      ]);
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "for whole staff - associates", "Bryony", "yes"]) await thread.say(turn);
      /*
       * "the same draft that we did with bryony castellane": her draft was
       * made, so the pack presses Create on her card, as the manager did. The
       * details then go to Bryony's open draft, and Tamsin's is copied from it.
       */
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Bryony Castellane" });
      const bryony = await thread.create();
      for (const turn of [
        details,
        "add details about the rolling rack",
        "Do the same coaching form for tamsin rookwood",
        "can you create the same draft that we did with bryony castellane by changing the name and position?",
        "ok, create the draft, but include the details of rolling rack.",
      ]) {
        await thread.say(turn);
      }
      expect(t.values(bryony).coaching_details ?? "", "Bryony's draft does not hold the details she gave").toMatch(/rolling rack/i);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Tamsin Rookwood" });
      const tamsin = await thread.create();
      const copied = t.values(tamsin).coaching_details ?? "";
      expect(copied, "Tamsin's draft does not hold the rolling-rack details").toMatch(/rolling rack/i);
      expect(copied, "Tamsin's draft does not hold the clips, first come first serve").toMatch(/first come first serve/i);
    },
  },
  {
    id: "nov3-stepb-b15-make-that-update",
    title: "\"make that update\" and \"I need to add that the shipping label …\" reach the team draft's Details, and no reply says updated without a change",
    report:
      'replay set b15 (rated 3): "i don\'t see the details updated in the draft card. Do i need to copy and paste it? or should it be automatically updating?" → "make that update" → … → "the changes weren\'t made in the details"',
    // Was open in production ("the open team draft's Details of Coaching never receives the SFS flow or the 15-minute rule; the revision path writes nothing"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const flow = "coaching is on sfs operations for clean organization and flow.  BCS has flagged our SFS due to printing shipping labels within 0 minutes of printing packing slips.  So we are implementing a new flow.  when packing slips are printed, they will be clipped to a designated rolling rack, in order of receiving the orders, then those orders will be fulfilled in order, and placed back on the rack in their basket, once orders are all fulfilled, the rack will go back to the shipping station, packed, and then print the shipping label.   Then, the next round of packing slips will be printed and clipped in order on the rack.";
      const rule = "the shipping label must not be printed until 15 minutes has passed form the packing slip being printed.";
      t.patchWrites([
        // The flow, added to the open team draft's Details.
        patchOutput("this_form", [{ field: "coaching_details", value: flow }]),
        // "this is perfect": nothing for the form.
        patchOutput("other"),
        // "make that update": the flow again — already there, so nothing changes, and the reply says so.
        patchOutput("this_form", [{ field: "coaching_details", value: flow }]),
        // "I need to add that …": the 15-minute rule, added.
        patchOutput("this_form", [{ field: "coaching_details", value: rule }]),
        // "the changes weren't made in the details": a complaint, nothing new.
        patchOutput("question"),
      ]);
      const thread = t.thread();
      await thread.say("can you create a coaching form for my whole staff?");
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", subject: "team" });
      const id = await thread.create();
      for (const turn of [
        flow,
        "this is perfect",
        "i don't see the details updated in the draft card.  Do i need to copy and paste it?  or should it be automatically updating?",
        "make that update",
      ]) {
        await turnOnDraft(t, thread, id, turn);
      }
      expect(t.values(id).coaching_details ?? "", 'after "make that update" the Details do not hold the new flow').toMatch(/rolling rack/i);
      for (const turn of [
        "can i reopen this for an edit?",
        `I need to add that ${rule}`,
        "the changes weren't made in the details",
      ]) {
        await turnOnDraft(t, thread, id, turn);
      }
      expect(t.values(id).coaching_details ?? "", "the 15-minute rule is not in the Details").toMatch(/shipping label must not be printed until 15 minutes/i);
      expect(t.values(id).coaching_details ?? "", "adding the 15-minute rule dropped the flow").toMatch(/rolling rack/i);
    },
  },
  {
    id: "nov3-stepb-b17-write-the-observation",
    title: "\"yes, do that\" / \"write the observtion\" put what Rosalind did on the draft, and no reply says updated without a change",
    report:
      'replay set b17 (rated 2): "rosalind marked an order as shipped but the customer hadn\'t picked up yet" → "yes, do that" → "it didnt edit in the card" → "the details we just discussed!!!" → "write the observtion"',
    // Was open in production ("Rosalind's Details of Coaching stays empty through \"yes, do that\" and \"write the observtion\"; the revision path writes nothing"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const topic = "ship from store, when to press ready for pick up and when to press mark as shipped";
      const what = "rosalind marked an order as shipped but the customer hadn't picked up yet";
      t.patchWrites([
        patchOutput("this_form", [{ field: "coaching_details", value: topic }]),
        patchOutput("this_form", [{ field: "coaching_details", value: what }]),
        // "yes, do that": what she already said, already on the draft.
        patchOutput("this_form", [{ field: "coaching_details", value: what }]),
        // "it didnt edit in the card": a complaint, nothing new.
        patchOutput("other"),
        // "the details we just discussed!!!", "write the observtion": the same sentence, already there.
        patchOutput("this_form", [{ field: "coaching_details", value: what }]),
        patchOutput("this_form", [{ field: "coaching_details", value: what }]),
      ]);
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "Rosalind", "yes"]) await thread.say(turn);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Rosalind Ashgrove" });
      const id = await thread.create();
      for (const turn of [
        topic,
        "can you upate the draft with these details of coaching?",
        what,
        "yes, do that",
      ]) {
        await turnOnDraft(t, thread, id, turn);
      }
      const said = /rosalind marked an order as shipped but the customer hadn't picked up yet/i;
      expect(t.values(id).coaching_details ?? "", 'after "yes, do that" the draft does not say what Rosalind did').toMatch(said);
      for (const turn of ["it didnt edit in the card", "the details we just discussed!!!", "write the observtion"]) {
        await turnOnDraft(t, thread, id, turn);
      }
      expect(t.values(id).coaching_details ?? "", 'after "write the observtion" the draft does not say what Rosalind did').toMatch(said);
    },
  },
  {
    id: "nov3-stepb-invented-sentence-refused",
    title: "a patch that mixes an invented sentence with some of the manager's real words is refused, and nothing is saved",
    report:
      'QA, 3 Nov 2026 (Step B review): the model\'s value must be the manager\'s words, not only its evidence. In b17\'s wording, "rosalind marked an order as shipped but the customer hadn\'t picked up yet", written up as something she never said',
    // Nothing is written in production either (the revision model writes nothing); with Step B the reducer refuses it.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const what = "rosalind marked an order as shipped but the customer hadn't picked up yet";
      /*
       * The half-the-words rule (MIN_SAID_SHARE) is a floor, not proof that a
       * sentence was said. Here it holds: the invented value reuses 9 of its
       * 25 words from her ("rosalind marked an order as shipped", "the",
       * "customer"), under half, so it is refused although its evidence is
       * her exact words. A rewording that kept half her words would pass the
       * floor; that limit is the rule's, and is why the evidence is checked too.
       */
      const invented =
        "rosalind marked an order as shipped and then lied to the customer about it, refused to apologise, and was rude to the store team all week";
      t.patchWrites([
        patchOutput("this_form", [{ field: "coaching_details", value: invented, evidence: what }]),
        // "write the observtion": her own sentence, which is written.
        patchOutput("this_form", [{ field: "coaching_details", value: what }]),
      ]);
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "Rosalind", "yes"]) await thread.say(turn);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Rosalind Ashgrove" });
      const id = await thread.create();
      const before = savedForm(t, id);
      const reply = await turnOnDraft(t, thread, id, what);
      expect(savedForm(t, id), "the invented sentence was saved").toBe(before);
      expect(t.values(id).coaching_details ?? "", "the invented sentence reached the Details").not.toMatch(/lied to the customer|rude to the store team/i);
      expect(reply.formUpdate, "the reply says the form changed").toBeUndefined();
      if (t.calls().patch > 0) {
        // Step B: the same model call, with her words as the value, is written.
        await turnOnDraft(t, thread, id, "write the observtion");
        /*
         * FORM_EDIT_TOOL_IN_STREAM_ENABLED (Step 3, classification 4 Nov 2026):
         * the same reading arrives as an edit_form call, whose ops carry no
         * evidence — the one writer's tool preset counts only the latest
         * message ("write the observtion"), so her earlier sentence is refused
         * (not_in_manager_words) and the turn goes to the old chain, which
         * writes nothing here, as in production today. Still nothing invented.
         */
        if (formEditToolInStreamEnabled()) {
          expect(t.values(id).coaching_details ?? "").not.toMatch(/lied to the customer/i);
          return;
        }
        expect(t.values(id).coaching_details ?? "", "her own sentence was not written").toMatch(/rosalind marked an order as shipped but the customer hadn't picked up yet/i);
        expect(t.values(id).coaching_details ?? "").not.toMatch(/lied to the customer/i);
      }
    },
  },
  {
    id: "nov3-stepb-daily-stats-edit",
    title: "\"Add that she Must Practice the sanitizing checklist every shift with Brennick before Daily Stats.\" edits the open Coaching Form — no knowledge answer, no new card",
    report:
      "QA's live production test, 3 Nov 2026: with a Coaching Form open, \"Add that she Must Practice the sanitizing checklist every shift with <coworker> before Daily Stats.\" got a generic answer about sales dashboards and the saved form was unchanged (the sibling app offered a new card instead)",
    /*
     * The path production takes: no form path claims the turn, and it falls
     * through to the knowledge answer. "Brennick" is read as a person, and is
     * on the roster (two people share the first name, so the roster gate keeps
     * it as a name), so the revision (`chat-revision.ts`, the roster name gate)
     * and the open-draft turn (`open-draft-turn.ts`) both return null — the
     * edit looks like it is about somebody else. Not askedQuestion, not a
     * report path. The patch turn already runs before both, so with the flag
     * on the model reads it as this form's and it is written; the order of
     * the paths is unchanged.
     */
    // Was open in production ("no form path takes the turn (the revision's roster name gate reads \"Brennick\" as another person), so it gets the knowledge answer and the form is unchanged"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const said = "Add that she Must Practice the sanitizing checklist every shift with Brennick before Daily Stats.";
      const sentence = "she Must Practice the sanitizing checklist every shift with Brennick before Daily Stats.";
      t.patchWrites([patchOutput("this_form", [{ field: "coaching_details", value: sentence }])]);
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "Odile", "yes"]) await thread.say(turn);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Odile Farrant" });
      const id = await thread.create();
      const reply = await turnOnDraft(t, thread, id, said);
      expect(reply.formProposal, "the edit offered a new card").toBeUndefined();
      expect(t.values(id).coaching_details ?? "", "the sentence is not on the form").toMatch(/sanitizing checklist every shift with Brennick before Daily Stats/i);
      expect(reply.formUpdate?.updated, "the reply is not the saved diff").toEqual(["coaching_details"]);
      expect(reply.content, "the reply is not the saved diff").toMatch(/^Changed Details of Coaching to "/);
    },
  },
  {
    id: "nov3-stepb-position-not-a-topic",
    title: "the employee's position and store (\"Team Member … at Omaha …\") is never written into a topic or the Other topic",
    report:
      "QA's live production test, 3 Nov 2026, in both apps: the person's position and store (\"Team Member at Omaha\" style) was written into the draft's Other topic",
    /*
     * Step B's draft write (`reduceDraftWrite`) leaves out a drafted text that
     * only restates the form's header — the position with the store or the
     * name, read from the form's own Job Title and Location (the roster's),
     * not from a word list — and unticks the box that line is the write-in
     * of (the template's own layout: the line after the group, labelled like
     * one of its options).
     */
    // Was open in production ("the drafting model's \"Team Member at Omaha\" is saved as the Other topic"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      // What the drafting model wrote live: Other ticked, and the position and store as its topic.
      t.draftWrites({ other_topic: "Team Member at Omaha" }, { coaching_topics: ["other"] });
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "Odile", "yes"]) await thread.say(turn);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Odile Farrant" });
      const id = await thread.create();
      const values = t.values(id);
      // Her position is on the roster ("Team Member Part Time") and on the form's Job Title line; her store on its Location line.
      expect(values.job_title).toBe("Team Member Part Time");
      expect(t.checked(id).coaching_topics ?? [], "Other is ticked with nothing beside it").not.toContain("other");
      for (const key of ["other_topic", "coaching_details"]) {
        expect(values[key] ?? "", `${key} holds her position`).not.toMatch(/team member/i);
        expect(values[key] ?? "", `${key} holds her store`).not.toMatch(/omaha/i);
      }
    },
  },
  {
    id: "nov3-stepb-typed-add-stays-the-managers",
    title: "an \"add\" to a line the manager typed stays hers: a later redraft keeps both what she typed and what she added",
    report:
      "QA's ruling on Step B, 3 Nov 2026 (option A): text added in chat to a field the manager typed is written as hers, so a redraft cannot replace her words",
    // Was open in production ("in production the chat \"add\" is not written at all, so the redrafted form lacks it"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const typed = "Rosalind was coached on ship from store: ready for pick up versus mark as shipped.";
      const what = "rosalind marked an order as shipped but the customer hadn't picked up yet";
      t.patchWrites([patchOutput("this_form", [{ field: "coaching_details", value: what }])]);
      const thread = t.thread();
      for (const turn of ["Create a coaching form.", "Rosalind", "yes"]) await thread.say(turn);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Rosalind Ashgrove" });
      const id = await thread.create();
      t.typeOnForm(id, { coaching_details: typed });
      await turnOnDraft(t, thread, id, `add that ${what}`);
      const added = t.values(id).coaching_details ?? "";
      expect(added, "her typed line was lost").toContain(typed);
      expect(added, "the add was not written").toContain(what);
      // A later redraft, whose drafting model rewrites the Details.
      t.draftWrites({ coaching_details: "Observed:\nRosalind needs to learn the ship from store screens." });
      await t.redraft(id, `Create a coaching form for Rosalind Ashgrove.\nadd that ${what}`);
      const after = t.values(id).coaching_details ?? "";
      expect(after, "the redraft replaced what she typed").toContain(typed);
      expect(after, "the redraft replaced what she added").toContain(what);
      expect(after, "the redraft's text replaced hers").not.toContain("needs to learn the ship from store screens");
    },
  },
  ...(["make it sound more professional", "can you make it more professional"] as const).map(
    (wording): ReplayCase => ({
      id: `nov3-stepb-wording-only-revision-${wording.startsWith("can") ? "can-you" : "make-it"}`,
      title: `"${wording}" rewrites the open draft: a patch that sets nothing hands the turn to the revision`,
      report: `QA, 3 Nov 2026 (blocker before the Step B flip): "${wording}" — the patch model reads it as about this form but sets nothing, and the reply was "I didn't change anything on the form." while the revision never ran`,
      status: "fixed",
      fixFlags: STEP_B_FLAGS,
      async run(t) {
        t.directory(PEOPLE);
        t.as("location_manager", WEST_DODGE);
        const plain = "Bryony was out of dress code three shifts in a row.";
        const polished = "Bryony did not follow the dress code on three consecutive shifts.";
        t.draftWrites({ coaching_details: plain });
        // A wording-only request: about this form, nothing to set from the manager's words.
        t.patchWrites([patchOutput("this_form")]);
        t.revisionWrites({ coaching_details: polished });
        const thread = t.thread();
        await thread.say("Create a coaching form for Bryony Castellane, she was out of dress code three shifts in a row");
        expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Bryony Castellane" });
        const id = await thread.create();
        const reply = await turnOnDraft(t, thread, id, wording);
        expect(t.values(id).coaching_details ?? "", "the revision never ran: the Details were not rewritten").toBe(polished);
        expect(reply.content, "the reply says nothing changed though the Details were rewritten").not.toMatch(/didn't change anything/i);
      },
    }),
  ),
  {
    id: "nov3-stepb-true-claim-keeps-guidance",
    title: "a correction that really changed the form keeps its own reply, the payroll amount question included, word for word",
    report:
      "QA's ruling on Step B, 3 Nov 2026: a path's guidance is never dropped when its claim is true — \"payroll deduct applies\" on an open Corrective Action asks for the amount",
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create ca form for pat rivera for a register shortage on 10-20-26.");
      expect(thread.proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera" });
      const id = await thread.create();
      const reply = await turnOnDraft(t, thread, id, "payroll deduct applies");
      expect(t.checked(id).payroll_deduct, "payroll deduct is not saved as Yes").toEqual(["yes"]);
      expect(reply.formUpdate?.updated ?? [], "the reply does not claim the payroll answer").toContain("payroll_deduct");
      expect(reply.content, "the amount question was dropped").toContain(PAYROLL_DEDUCT_AMOUNT_QUESTION);
    },
  },
  {
    id: "nov3-stepb-payroll-as-given",
    title: "\"payroll deduct applies and $3.25 will be deducted from check\" — Yes, $3.25 exactly, and the deduction in the action plan",
    report:
      'HR, 21 Oct 2026: "create ca form for pat rivera for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check."',
    // production-flags.json corrected to Vercel (QA, 5 Nov 2026): PLAN_PAYROLL_SENTENCE_ENABLED is on in production, and with it the saved action plan carries the $3.25 deduction. Was OPEN ("the saved action plan is the generic sentence with no $3.25 deduction in it").
    // Pau ruled 5 Nov 2026: the AI SHOULD write the Action Plan (ACTION_PLAN_MANAGER_ONLY_ENABLED stays off in both apps).
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create ca form for pat rivera for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check.");
      expect(thread.proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera" });
      const id = await thread.create();
      // The Yes/No group is saved as a ticked option: `t.checked` reads it.
      expect(t.checked(id).payroll_deduct, "payroll deduct is not saved as Yes").toEqual(["yes"]);
      const values = t.values(id);
      expect(values.payroll_deduct_amount, "the amount is not $3.25 as given").toBe("$3.25");
      expect(values.action_plan ?? "", "the action plan does not carry the $3.25 deduction").toMatch(/\$3\.25/);
      expect(JSON.stringify(values), "an amount she did not give is on the form").not.toMatch(/\$(?!3\.25\b)\d/);
    },
  },
  {
    id: "nov3-stepb-date-as-given",
    title: "the incident date \"on 10-1-26\" is the form's Date, written once, and no other date is invented",
    report:
      'HR, 21 Oct 2026: the form "repeated the date of the offense" and "used 10-21-26 instead of 10-1-26"',
    /*
     * NOT FIXED BY STEP B, and left without fixFlags. The second "10-1-26" is
     * the Observation's own text: in production the drafting model's
     * sentence, here (the pack's model writes nothing) the draft route's
     * never-blank fallback, which quotes the manager's words. Step B merges
     * fields; it does not rewrite a sentence, and taking "on 10-1-26" out of
     * one needs a word list or a drafting-prompt change, both outside it.
     */
    status: { open: "the incident date is written twice: the Date field and again in the Observation (\"… on 10-1-26\")" },
    // Fixed under INCIDENT_DATE_ONCE_ENABLED (port from the sibling app, 10 Nov 2026): the Date is not said again in the Observation; open on production flags until QA flips it.
    fixFlags: ["INCIDENT_DATE_ONCE_ENABLED"],
    async run(t) {
      // HR's report was written on 21 Oct 2026; "today" must not leak onto the form.
      vi.setSystemTime(new Date("2026-10-21T15:30:00Z"));
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a verbal ca for pat rivera for being late to her shift on 10-1-26. payroll deduct not applicable");
      expect(thread.proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera" });
      const id = await thread.create();
      const values = t.values(id);
      expect(values.form_date, "the Date is not the incident date she gave").toBe("2026-10-01");
      const dates = Object.entries(values).flatMap(([key, value]) => (value.match(DATE_SHAPES) ?? []).map((text) => ({ key, text, day: monthDay(text) })));
      expect(dates.filter((date) => date.day !== "10-01"), "a date she did not give is on the form").toEqual([]);
      expect(dates.map((date) => `${date.key}: ${date.text}`), "the incident date is written more than once").toEqual(["form_date: 2026-10-01"]);
    },
  },
  {
    id: "nov3-stepb-prior-coaching-kept",
    title: "a prior coaching \"signed May 2025\" added to the open Corrective Action reaches Prior Actions, or the reply says it did not",
    report:
      "the sibling app's 2 Nov scan (s8), the mechanism here: the manager gave the prior coaching and when it was signed; it was not on the form, and the reply said everything else was as it was",
    // Was open in production ("Prior Actions stays empty and the reply says the form is \"as it was\" without saying the prior coaching was not placed"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: STEP_B_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("CA for Remy Calder for underperformance in the month of October");
      expect(thread.proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Remy Calder" });
      const id = await thread.create();
      const said = "Previous coaching was when she signed the policy manual, signed May 2025";
      t.patchWrites([patchOutput("this_form", [{ field: "prior_actions", value: "Coaching when she signed the policy manual — signed May 2025", evidence: said }])]);
      const reply = await turnOnDraft(t, thread, id, said);
      expect(reply.formProposal, "the turn about her open draft offered a new card").toBeUndefined();
      expect(t.values(id).prior_actions ?? "", "Prior Actions does not hold the coaching signed May 2025").toMatch(/may 2025/i);
      expect(reply.content, "the prior coaching was dropped and the reply says the form is as it was").not.toMatch(/\bas it was\b|nothing else (?:has )?changed/i);
    },
  },
];
