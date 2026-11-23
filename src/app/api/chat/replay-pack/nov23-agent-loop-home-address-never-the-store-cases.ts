import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN ADDRESS GIVEN AS THE EMPLOYEE'S NEVER PICKS THE CARD'S STORE (QA, 23 Nov 2026, the u22 live run on main 1e58cd6)
 * ============================================================================
 *
 * The u22 chat (a global district manager; the former employee and the address QA's test ones): T1 "create exit for
 * <P17>. …", T2 "address: 123 Test St, Lees Summit, MO. 00000". The T2 reply read "Filed at **Lee's Summit, MO**, as you
 * said.": the employee's home address was read as the store. A store named inside an address line given as the
 * employee's address never sets the card's store; the address belongs in the exit form's Permanent Address.
 * Here the person's own store is another one, so a card filed at Lee's Summit can only have come from the address.
 */

const REPORT = "QA (23 Nov 2026, u22 live on main 1e58cd6): the manager's home-address line \"address: 123 Test St, Lees Summit, MO. 00000\" was read as the store (\"Filed at Lee's Summit, MO, as you said\")";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const LEES_SUMMIT = "loc-219";
const P17: DirectoryRow = { id: "e-odile-marchetti", firstName: "Odile", lastName: "Marchetti", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 =
  "create exit for Odile Marchetti. Odile Marchetti's last day worked was TBD. On 11-14-26 General Manager, Ravi Ostrom, messaged Odile Marchetti via woven regarding her hours worked on 11-13-26. Odile Marchetti messaged back stating she did not work 11-13-26 and she was quitting effective immediately.";
const T2 = "address: 123 Test St, Lees Summit, MO. 00000";
const ACCOUNT = "On 11/14/26, General Manager Ravi Ostrom messaged Odile Marchetti via Woven regarding Odile Marchetti's hours worked on 11/13/26. Odile Marchetti messaged back stating Odile Marchetti did not work 11/13/26 and was quitting effective immediately.";
const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

/** The exit card each turn; at T2 `store` is what the model passes as the card's store (none, or the address's city). */
const model = (store: string | null) =>
  loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { card?: { store?: string | null }; reason_code?: string } | null;
    if (result) return { text: result.card ? `Here's the Resignation/Exit Form for **Odile Marchetti**.${result.card.store ? ` Filed at **${result.card.store}**.` : ""}` : `refused: ${result.reason_code}` };
    const back = said(view) === T1 ? 0 : 1;
    return {
      tool: "propose_form",
      input: {
        template_key: "resignation-exit",
        employee_name: "Odile Marchetti",
        exit_type: "resignation",
        exit_evidence: { ...evidenceFrom(view, "create exit for Odile Marchetti", back), kind: "asks_for_exit_form" },
        what_happened: ACCOUNT,
        person_evidence: evidenceFrom(view, "Odile Marchetti", back),
        ...(store && said(view) === T2 ? { store } : {}),
      },
    };
  });

async function chat(t: ReplayContext, store: string | null) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([P17]);
  t.as("location_manager", GLOBAL);
  t.loopModel!(model(store), { scripted: true });
  const thread = t.thread();
  await thread.say(T1);
  const reply = await thread.say(T2);
  return { thread, reply };
}

export const NOV23_AGENT_LOOP_HOME_ADDRESS_NEVER_THE_STORE_CASES: ReplayCase[] = [
  {
    id: "nov23-home-address-city-is-not-the-store",
    title: "T2 \"address: 123 Test St, Lees Summit, MO. 00000\" (the employee's address): the card is never filed at Lee's Summit, and the reply never says it is, \"as you said\" or otherwise",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, null);
      expect(thread.proposal?.locationId ?? null, `the address picked the store:\n${reply.content}`).not.toBe(LEES_SUMMIT);
      expect(reply.content).not.toMatch(/Lee's Summit|Lees Summit/);
    },
  },
  {
    id: "nov23-home-address-city-typed-as-store-not-filed",
    title: "The model passes the address's city as the store (store \"Lees Summit, MO\"): the manager named that city only inside the employee's address, so the card is never filed there",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, "Lees Summit, MO");
      expect(thread.proposal?.locationId ?? null, `the address picked the store:\n${reply.content}`).not.toBe(LEES_SUMMIT);
      expect(reply.content).not.toMatch(/Filed at \*\*Lee's Summit/);
    },
  },
  {
    id: "nov23-store-named-outside-address-still-files",
    title: "Control: \"this is for the lees summit, mo store. address: 123 Test St, Kearney, NE 68847\" names the Lee's Summit store outside the address, so the card is filed there (and never at Kearney)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([P17]);
      t.as("location_manager", GLOBAL);
      t.loopModel!(model(null), { scripted: true });
      const thread = t.thread();
      await thread.say(T1);
      const reply = await thread.say("this is for the lees summit, mo store. address: 123 Test St, Kearney, NE 68847");
      expect(thread.proposal?.locationId ?? null, reply.content).toBe(LEES_SUMMIT);
    },
  },
];
