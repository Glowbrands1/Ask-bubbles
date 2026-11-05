import { expect, vi } from "vitest";
import { formOpportunityLead } from "@/lib/forms/form-opportunity";

import {
  endsAsSentence,
  noAsYouSaidUnlessSaid,
  STAFF,
  WEST_DODGE,
  type DirectoryRow,
  type ReplayAnswer,
  type ReplayCase,
  type ReplayContext,
} from "./cases";

/**
 * ============================================================================
 * THE 5 NOV 2026 SILENT-FAILURE SET (PLAN.md, Step 0)
 * ============================================================================
 *
 * sf-b6 is a production chat from this app (4 Nov 2026, 19:45 UTC). Its
 * trace row says `stop_reason: end_turn` — the model finished; the reply's
 * last line, "Based on what you've described, I can prepare:", is the form
 * picker's heading (`formOpportunityLead`), added by code while a Corrective
 * Action was already in progress on a proposal card. Split in three: the
 * reply (Step 1, REPLY_CUT_CHECK_ENABLED), the policy and the card (later
 * steps).
 *
 * The manager's words as written, with the employee's name invented
 * (checked against both apps' directories).
 */

/** How the production replies ended, word for word. */
const LIVE_ENDING = "Based on what you've described, I can prepare:";

export const TALIA: DirectoryRow = {
  id: "e-tb",
  firstName: "Talia",
  lastName: "Brennick",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const REQUEST = "I need a corrective action form for Talia Brennick for counting the drawer early and turning away a customer";
const DETAIL =
  "can you have it include that we recieved a customer complaint from Sunday 11-1, she started closing the last register at 4:56pm and we cant close until the store is closed at 5pm, we had a customer come in at 4:59 and was told them that we were closed";
const FROM_CONVERSATION = "Create a Corrective Action Form from this conversation.";

/** The answering model's reply to DETAIL in production, name replaced, without the heading code added after it. */
const MODEL_REPLY = [
  "I can add that detail as the factual account on the form, but I want to flag something first: none of the sources available to me state a policy against closing a register before the store's closing time, or a requirement tied to a specific till-closing minute — so I can't cite a policy breach on this point. The Revel sources only describe the End of Day process steps, not a timing rule.",
  "",
  "Here's what I can put on the Corrective Action Form:",
  "",
  "**Incident detail (as reported):** On Sunday, 2026-11-01, a customer complaint was received stating that Talia Brennick began closing the last register at 4:56pm, before the store's 5:00pm close. A customer who entered at 4:59pm was told the store was closed.",
  "",
  "I'll include that as the factual account — but the \"policy breached in the manual's own words\" field needs an actual cited policy. If you know which policy covers till/cash-handling timing near close, tell me and I'll pull it from the knowledge base; otherwise I'd leave that field for you to complete, since I can't state a policy that isn't in the sources.",
  "",
  "Also still need from you:",
  "- **Verbal or Written warning?**",
  "- **Payroll deduct — Yes or No?**",
  "- Any prior coaching/corrective action to note (I won't assume any).",
  "",
  "Let me know and I'll fold it all together — then just say \"create the corrective action form for Talia Brennick\" when you're ready.",
].join("\n");

const REPORT =
  "\"Bot said no source states a policy and it would leave the field for the manager, then the saved form had a policy filled in by the AI. Reply ended mid-sentence: 'Based on what you've described, I can prepare:'. The next card ignored the detail added after it.\" (QA, 5 Nov 2026)";

export const NOV5_SF_B6_CASES: readonly ReplayCase[] = [
  {
    // Stricter variant of nov5-sf-b6-full-sentence-and-added-detail (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-b6-reply",
    title: "a detail added while a Corrective Action is on its proposal card: the reply never ends on the form picker's heading",
    report: REPORT,
    status: { open: "REPLY_CUT_CHECK_ENABLED (Step 1): no picker or heading while a form is in progress" },
    fixFlags: ["REPLY_CUT_CHECK_ENABLED"],
    async run(t) {
      t.directory([...STAFF, TALIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      expect(first.formProposal, "the first turn shows the Corrective Action card").toBeTruthy();
      t.modelSays(MODEL_REPLY);
      const reply = await thread.say(DETAIL);
      endsAsSentence(reply, DETAIL, true);
      // The model's own words are all still there: the fix removes only what code added.
      expect(reply.content).toContain("Let me know and I'll fold it all together");
    },
  },
  {
    // The live wording (QA for Pau, 5 Nov 2026: 4 replies in 2 chats, 2 and 4 Nov, ended exactly so).
    id: "sf-b6-reply-live-ending",
    title: "the live shape of sf-b6: the reply never ends exactly \"Based on what you've described, I can prepare:\"",
    report: REPORT,
    status: { open: "REPLY_CUT_CHECK_ENABLED (Step 1): no picker or heading while a form is in progress" },
    fixFlags: ["REPLY_CUT_CHECK_ENABLED"],
    async run(t) {
      t.directory([...STAFF, TALIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      expect(first.formProposal, "the first turn shows the Corrective Action card").toBeTruthy();
      t.modelSays(MODEL_REPLY);
      const reply = await thread.say(DETAIL);
      expect(formOpportunityLead(), "the live line is the picker's own heading").toBe(LIVE_ENDING);
      expect(reply.content.trimEnd().endsWith(LIVE_ENDING) ? reply.content : null, "the reply ends exactly on the picker's heading").toBeNull();
      endsAsSentence(reply, DETAIL, true);
      // The model's own words are all still there: the fix removes only what code added.
      expect(reply.content).toContain("Let me know and I'll fold it all together");
    },
  },
  {
    // Stricter variant of nov5-sf-b6-full-sentence-and-added-detail (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-b6-policy",
    title: "after the reply said it would leave the policy for the manager, the drafted form has no AI-written policy",
    report: REPORT,
    status: { open: "a later step (FORM_OPS_CHECKS_ENABLED): a policy field only from a manual section retrieved that turn" },
    async run(t) {
      t.directory([...STAFF, TALIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(REQUEST);
      t.modelSays(MODEL_REPLY);
      await thread.say(DETAIL);
      t.modelSays(null);
      await thread.say(FROM_CONVERSATION);
      /*
       * As in production: the drafting model ticks Standards of Conduct, and
       * the policy fields follow from the tick (Policy Violated derived from
       * the box, the manual's quote found by the fallback heading match) —
       * after the reply said no source states a policy and it would leave the
       * field for the manager.
       */
      t.draftWrites(
        {
          observation:
            "A customer complaint was received regarding Sunday, November 1, 2026. Talia Brennick began counting down the last register at 4:56pm, prior to the store's 5:00pm close, and a customer who came in at 4:59pm was told the store was closed.",
        },
        { offense_type: ["standards_of_conduct"] },
      );
      const id = await thread.create();
      const values = t.values(id);
      expect(
        { policy_violated: values.policy_violated ?? "", policy_language: values.policy_language ?? "" },
        "the reply said it would leave the policy for the manager; the drafted form has one written by the AI",
      ).toEqual({ policy_violated: "", policy_language: "" });
    },
  },
  {
    // Stricter variant of nov5-sf-b6-full-sentence-and-added-detail (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-b6-card",
    title: "the card after a detail was added carries that detail",
    report: REPORT,
    status: { open: "a later step (FORM_RECORD_ENABLED): the record holds the added detail and the card reads it" },
    async run(t) {
      t.directory([...STAFF, TALIA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(REQUEST);
      t.modelSays(MODEL_REPLY);
      await thread.say(DETAIL);
      t.modelSays(null);
      const card = await thread.say(FROM_CONVERSATION);
      expect(card.formProposal, "a Corrective Action card").toBeTruthy();
      const shown = `${card.content}\n${JSON.stringify(card.formProposal)}`;
      expect(shown, "the card ignores the detail added after the first card").toMatch(/4:56|4:59|customer complaint/i);
    },
  },
];

type T = ReplayContext;
type Thread = ReturnType<T["thread"]>;

const STORE = "loc-264";
const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [STORE],
  positionName: "Team Member Part Time",
});

/* --------------------------------------- sf-s21 to sf-s29 (the sibling app's chats) -- */

const ODESSA = person("e-odessa-quillfeather", "Odessa", "Quillfeather");
const RHEA = person("e-rhea-vantress", "Rhea", "Vantress");

const SF_S_REPORT = "QA, 5 Nov 2026: the sibling app's silent-failure scan (names replaced by \"Employee R\"), the same mechanism with this app's words";
const ASKS_WHAT_HAPPENED = /haven'?t told me what happened|what happened\?|tell me what happened/i;
const READY_CLAIM = /everything i need is here|i have everything|all set to draft|ready to draft/i;

function startSibling(t: T): Thread {
  vi.setSystemTime(new Date("2026-11-05T15:30:00Z"));
  t.directory([...STAFF, ODESSA, RHEA, TALIA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/**
 * FORM_FULL_REMAP_ENABLED, AS THE SIBLING APP'S PRODUCTION HAD IT FOR THESE CHATS. Their cards
 * ("**Policy:** Standards of Conduct, as you said", "**Policy:** Late
 * Opening, as you said") have a shape only `form-full-remap.ts` writes
 * (`remapPolicyLine`), yet the sibling app's `production-flags.json` lists the flag as not on (it is not on here either).
 * QA to confirm the production setting: if it is on, add it to that file in
 * the same pull request and delete this function; if it is off, these chats
 * came from somewhere the pack does not model. The harness resets the flag
 * before every case (`ALL_FLAGS`), so it is on for this case only.
 */
function remapAsInProduction(): void {
  process.env.FORM_FULL_REMAP_ENABLED = "true";
}

/** Every manager turn of a thread so far, as the checks read them. */
function managerTurns(said: readonly string[]): string[] {
  return [...said];
}

/** The other employee's CA, pasted by the manager as a template (sf-s21's mechanism; invented, this app's words). */
const PASTED_CA = [
  "Corrective Action — Rhea Vantress",
  "Type of warning: Verbal",
  "Observation: In September Rhea Vantress finished at 212 sales with sales per hour 18.40, add-on 9%, Average Sale 41 and UPT 2.2, below the store goals for each.",
  "Policy Violated: Standards of Conduct",
  "Direct policy from official manual: Failing to follow the policies and procedures of The Company",
  "Action Plan: Rhea will review the Must See Behaviors with her Store Manager weekly. She will meet each goal by the end of October.",
].join("\n");

export const NOV5_SIBLING_SF_S_CASES: readonly ReplayCase[] = [
  {
    // Stricter variant of nov5-twin-sf-s21-must-see-behaviors-template (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s21",
    title: "a CA for one employee's must see behaviors, then another employee's CA pasted as a template: only this employee's facts, no false \"as you said\", the asked-for fill applied",
    report: `${SF_S_REPORT}: "create a ca for must see behaviors for performance this should be for Employee R - verbal 146 sales Below in sales per hour, add-on %, Average Sale, UPT" → "Policy: Standards of Conduct, as you said." A pasted CA for another employee; "I need you to fill in the information for me" saved the other employee's month and numbers.`,
    // Holds in this app with production's flags: the pasted CA's facts never reach this employee's form here (the sibling app's bug does not reproduce).
    status: "fixed",
    async run(t) {
      remapAsInProduction();
      const thread = startSibling(t);
      const said: string[] = [];
      const first = "create a ca for must see behaviors for performance this should be for Odessa Quillfeather - verbal 146 sales Below in sales per hour, add-on %, Average Sale, UPT";
      said.push(first);
      const card = await thread.say(first);
      noAsYouSaidUnlessSaid(card, managerTurns(said));
      /*
       * Here, with production's flags (CA_SALES_POLICY_ENABLED off), a
       * metric alone opens no Corrective Action — the reply says so, as this
       * app's policy answer, which asks for the coaching already done. The
       * card comes from the conduct and coaching the manager names next, so
       * the paste is tested on a CA as in the sibling app.
       */
      if (!thread.proposal) {
        const conduct = "create a ca for Odessa Quillfeather, verbal, she did not do her must see behaviors on any shift this week, we already did coaching on 10/14";
        said.push(conduct);
        noAsYouSaidUnlessSaid(await thread.say(conduct), managerTurns(said));
      }
      t.draftWrites({ observation: "Observed:\nOdessa Quillfeather finished at 146 sales, below goal in sales per hour, add-on %, Average Sale and UPT." }, { offense_type: ["standards_of_conduct"] });
      const id = await thread.create();
      const paste = `can you make it look like this one with her info\n\n${PASTED_CA}`;
      said.push(paste);
      await thread.say(paste);
      // As in production: the revision copies the pasted form's facts.
      t.revisionWrites({ observation: "Observed:\nIn September Odessa Quillfeather finished at 212 sales with sales per hour 18.40, add-on 9%, Average Sale 41 and UPT 2.2, below the store goals for each." });
      said.push("I need you to fill in the information for me");
      await thread.say("I need you to fill in the information for me");
      const saved = t.values(id);
      expect(saved.observation ?? "", "the other employee's month and numbers are on this employee's form").not.toMatch(/september|212 sales|18\.40/i);
      expect(saved.observation ?? "", "this employee's own facts are gone").toMatch(/146/);
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s22-ca-not-coaching (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s22",
    title: "\"It needs to be a CA, not a coaching form\": the type the manager typed wins and stays; another person's notes never reach the observation",
    report: `${SF_S_REPORT}: "It needs to be a CA, not a coaching form" → the bot later went back to "Here is what I would put on a Coaching Form" twice after "Its a CA". Reviewer notes about another employee were pasted into the observation.`,
    status: { open: "Step 4 (explicit type wins) and a later step (pasted notes go to sourceNotes)" },
    async run(t) {
      const thread = startSibling(t);
      await thread.say("coaching form for Odessa Quillfeather, she was below on add-on % and UPT this month");
      const ca = await thread.say("It needs to be a CA, not a coaching form");
      expect(thread.proposal?.templateKey, `the card is not a CA after "It needs to be a CA":\n${ca.content}`).toBe("dpoa");
      t.modelSays("Here is what I would put on a Coaching Form for Odessa Quillfeather:\n\n- Add-on % and UPT below goal this month.");
      const later = await thread.say("Its a CA");
      expect(later.content, "back to a Coaching Form after \"Its a CA\"").not.toMatch(/coaching form/i);
      expect(thread.proposal?.templateKey ?? "dpoa", "the card went back to a Coaching Form").toBe("dpoa");
      t.draftWrites({ observation: "Observed:\nReviewer notes for Rhea Vantress: Rhea missed two Must See Behaviors on the floor walk." });
      const id = await thread.create();
      expect(t.values(id).observation ?? "", "another employee's notes are in the observation").not.toMatch(/rhea/i);
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s23-payroll-answer-and-policy-change (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s23",
    title: "\"not pay roll deductable\" fills the payroll answer; moving the policy to Under Performance moves the action plan and policy text with it",
    report: `${SF_S_REPORT}: "not pay roll deductable" → put in the observation and the payroll question asked again. "it should be under performance not standard of conduct" → the policy changed but the action plan and policy text still said Standards of Conduct.`,
    status: { open: "a later step: one apply function updates every field a policy change touches; the payroll answer fills its field" },
    async run(t) {
      const thread = startSibling(t);
      await thread.say("CA for Odessa Quillfeather, verbal, she sold 4 add-ons out of 60 customers this week");
      const answered = await thread.say("not pay roll deductable");
      expect(answered.content, "the payroll question is asked again after it was answered").not.toMatch(/payroll deduct(?:ion)?(?: applicable)?\?/i);
      t.draftWrites(
        {
          observation: "Observed:\nOdessa Quillfeather sold 4 add-ons out of 60 customers this week.",
          action_plan: "Odessa will follow the Standards of Conduct on every shift. She will review the Standards of Conduct with her Store Manager.",
        },
        { offense_type: ["standards_of_conduct"] },
      );
      const id = await thread.create();
      expect(t.values(id).observation ?? "", "the payroll answer went into the observation").not.toMatch(/pay ?roll/i);
      await thread.say("it should be under performance not standard of conduct");
      const saved = t.values(id);
      expect(saved.action_plan ?? "", "the action plan still names Standards of Conduct after the policy moved").not.toMatch(/standards? of conduct/i);
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s24-must-see-behaviors-and-coaching-on-file (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s24",
    title: "\"it should be must see behaviors …\": no false \"as you said\"; the card and the saved form agree; the observation is not the whole message",
    report: `${SF_S_REPORT}: "it should be must see behaviors and she also had coaching on file … 10/22 and … 10/15" → "Policy: Standards of Conduct, as you said."; the whole message in the observation; the saved policy was Under Performance.`,
    // Holds in this app with production's flags: no false "as you said" and the observation is not the whole message here (the sibling app's bug does not reproduce).
    status: "fixed",
    async run(t) {
      remapAsInProduction();
      const thread = startSibling(t);
      const said = ["CA for Odessa Quillfeather, verbal", "it should be must see behaviors and she also had coaching on file for it 10/22 and a coaching on 10/15"];
      await thread.say(said[0]!);
      const card = await thread.say(said[1]!);
      noAsYouSaidUnlessSaid(card, said);
      t.draftWrites({ observation: `Observed:\n${said[1]}` }, { offense_type: ["standards_of_conduct"] });
      const id = await thread.create();
      expect((t.values(id).observation ?? "").toLowerCase(), "the whole message is the observation").not.toContain(said[1]!.toLowerCase());
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s25-closing-no-late-opening-claim (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s25",
    title: "a CA with times: no invented \"as you said\" policy; the observation is the incident, not an earlier question",
    report: `${SF_S_REPORT}: "Write a CA for Employee R … on 11/3/26 she was scheduled until 9:15PM and clocked out at 9:01. She also took the soap display down at 8:11 PM before the store was closed." → "Policy: Late Opening, as you said."; the observation held an earlier question.`,
    status: { open: "Step 6: \"as you said\" only for the manager's words; the observation never a question" },
    async run(t) {
      remapAsInProduction();
      const thread = startSibling(t);
      const question = "what policy covers leaving before the end of a shift?";
      const request =
        "Write a CA for Odessa Quillfeather on 11/3/26 she was scheduled until 9:15PM and clocked out at 9:01. She also took the soap display down at 8:11 PM before the store was closed.";
      await thread.say(question);
      const card = await thread.say(request);
      noAsYouSaidUnlessSaid(card, [question, request]);
      t.draftWrites({ observation: `Observed:\n${question}` });
      const id = await thread.create();
      expect(t.values(id).observation ?? "", "the observation is the manager's question").not.toMatch(/\?\s*$|what policy covers/i);
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s26-edit-misspelled-ca and nov5-twin-sf-s26-change-ca-new-chat (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s26",
    title: "\"Change Employee R CA\" in a new chat finds the existing CA and opens it; a misspelled name still finds it",
    report: `${SF_S_REPORT}: "Edit [misspelled Employee R] CA" → the bot asked who the form is for. New chat: "Change Employee R CA" → a new form, "You haven't told me what happened yet".`,
    status: { open: "a later step: the record finds the employee's open CA on file" },
    async run(t) {
      const first = startSibling(t);
      await first.say("CA for Odessa Quillfeather, verbal, she left before the end of her shift on 11/3");
      t.draftWrites({ observation: "Observed:\nOdessa Quillfeather left before the end of her shift on 11/3." });
      await first.create();
      const misspelled = await t.thread().say("Edit Odesa Quilfeather CA");
      expect(misspelled.content, "asked who the form is for with the name given").not.toMatch(/who (?:is|should) (?:this|the form)/i);
      const reply = await t.thread().say("Change Odessa Quillfeather CA");
      expect(reply.content, "started a new form and asked what happened").not.toMatch(ASKS_WHAT_HAPPENED);
      expect(reply.formOpened, `the existing CA is not opened:\n${reply.content}`).toBeTruthy();
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s27-coaching-name-only-asks-what-happened (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s27",
    title: "\"Create a coaching form.\" then a name: asks what happened; never says everything is ready without an incident",
    report: `${SF_S_REPORT}: "Create a coaching form." → "Employee R" → "Everything I need is here … I have the employee and the store." with no draft and no incident.`,
    status: { open: "Step 2's missing-fields list: never \"ready\" while a required field is empty" },
    async run(t) {
      remapAsInProduction();
      const thread = startSibling(t);
      await thread.say("Create a coaching form.");
      const reply = await thread.say("Odessa Quillfeather");
      expect(reply.content, "says everything is ready with no incident").not.toMatch(READY_CLAIM);
      expect(reply.content, "does not ask what happened").toMatch(ASKS_WHAT_HAPPENED);
    },
  },
  {
    // Stricter variant of nov5-twin-sf-s28-incident-from-previous-turn and nov5-twin-sf-s28-incident-scope and nov5-twin-sf-s28-control-policy-question (QA, 5 Nov 2026: both kept until the pack is deduplicated).
    id: "sf-s28",
    title: "the incident asked about one turn, the CA asked for the next: the incident is used, never \"You haven't told me what happened\"",
    report: `${SF_S_REPORT}: "can i give a ca for not signing off on the cleaning check list" → "can you write me a ca for Employee R from west dodge" → "You haven't told me what happened yet" and the observation was the question.`,
    // Holds in this app with production's flags: the incident from the previous turn is used here (the sibling app's bug does not reproduce).
    status: "fixed",
    async run(t) {
      const thread = startSibling(t);
      await thread.say("can i give a ca for not signing off on the cleaning check list");
      const reply = await thread.say("can you write me a ca for Odessa Quillfeather from west dodge");
      expect(reply.content, "asks what happened although the previous turn said").not.toMatch(ASKS_WHAT_HAPPENED);
      if (thread.proposal) {
        t.draftWrites({ observation: "Observed:\ncan i give a ca for not signing off on the cleaning check list" });
        const id = await thread.create();
        expect(t.values(id).observation ?? "", "the observation is the manager's question").not.toMatch(/can i give/i);
      }
    },
  },
  {
    id: "sf-s29",
    title: "\"are there any coaching and ca's for Employee R\": the forms on file are looked up, never a form card or a description of the CA",
    report: `${SF_S_REPORT}: "are there any coaching and ca's for Employee R" → the bot described the CA form type instead of checking the employee's file.`,
    // Holds in this app with production's flags: the question goes to the forms on file here (the sibling app's bug does not reproduce).
    status: "fixed",
    async run(t) {
      const thread = startSibling(t);
      const before = t.calls().chat;
      const reply = await thread.say("are there any coaching and ca's for Odessa Quillfeather");
      expect(reply.formProposal ?? null, `a form card for a question about forms on file:\n${reply.content}`).toBeNull();
      expect((reply as ReplayAnswer & { formSelection?: unknown }).formSelection ?? null, "a form picker for a question about forms on file").toBeNull();
      expect(t.calls().chat, "the question was not answered from the forms on file").toBeGreaterThan(before);
    },
  },
];
