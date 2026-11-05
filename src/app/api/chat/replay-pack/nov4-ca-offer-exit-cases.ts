import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";
import { pauFivePeople } from "./nov4-ca-sales-pau-five-cases";

/**
 * ============================================================================
 * #5'S OFFER ON EVERY PATH (QA's live traces, 4 Nov 2026; CA_SALES_POLICY_ENABLED)
 * ============================================================================
 *
 * In production "<name> did not follow must see behaviors which violates
 * standards of conduct policy" came back without "Do you want a Corrective
 * Action for <name>?" — once with a Coaching / Corrective Action menu, once on
 * a path that records no intent — while the live script, on the plain policy
 * answer, passed. The offer is now added at the turn's one exit, and a menu
 * offering the Corrective Action Form is replaced by it (ask once, card after
 * yes). Every person is invented (`nov4-ca-sales-pau-five-cases.ts`).
 */

type T = ReplayContext;

const FLAGS = ["CA_SALES_POLICY_ENABLED", "CHAT_GLOSSARY_ENABLED"];
const REPORT = "QA live traces, 4 Nov 2026 (both apps): #5 answered without the one Corrective Action offer";
const OFFER = /\*\*Do you want a Corrective Action for Ysolde Marrowick\?\*\*[^\n]*\*\*Standards of Conduct\*\*/;

function start(t: T) {
  vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
  t.directory([...STAFF, ...pauFivePeople()]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function offersOnce(reply: ReplayAnswer): void {
  expect(reply.content, `no single offer:\n${reply.content}`).toMatch(OFFER);
  expect(reply.content.match(/Do you want a Corrective Action for/g) ?? [], "asked more than once").toHaveLength(1);
}

export const NOV4_CA_OFFER_EXIT_CASES: ReplayCase[] = [
  {
    id: "nov4-offer-exit-replaces-menu",
    title: "a Coaching / Corrective Action menu for the employee is replaced by the one offer; \"yes\" makes the card",
    report: `${REPORT}: the menu (the sibling app's trace and this app's)`,
    status: { open: "with production's flags the reply is a Coaching / Corrective Action menu, with no offer" },
    fixFlags: FLAGS,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a form for Ysolde Marrowick, she did not follow must see behaviors which violates standards of conduct policy");
      expect((reply as ReplayAnswer & { formSelection?: unknown }).formSelection ?? null, "the menu is still shown").toBeNull();
      expect(thread.proposal ?? null, "a card was made before yes").toBeNull();
      offersOnce(reply);
      await thread.say("yes");
      expect(thread.proposal, "\"yes\" made no Corrective Action card").toMatchObject({ templateKey: "dpoa", employeeName: "Ysolde Marrowick" });
    },
  },
  {
    id: "nov4-offer-exit-tool-path",
    title: "#5's statement with another draft open (the main call carries the edit tool): still the one offer",
    report: `${REPORT}: the tool path`,
    status: { open: "with production's flags no offer" },
    fixFlags: FLAGS,
    async run(t) {
      const thread = start(t);
      await thread.say("create a corrective action for Thaddeus Quillane for being late to his shift on 11/2");
      t.draftWrites({ observation: "Observed:\nThaddeus Quillane arrived late to his shift on November 2." }, { offense_type: ["attendance_policy"] });
      await thread.create();
      const reply = await thread.say("Ysolde Marrowick did not follow must see behaviors which violates standards of conduct policy");
      offersOnce(reply);
    },
  },
];
