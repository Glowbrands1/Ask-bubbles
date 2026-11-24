import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE RESIGNATION REASON THE MANAGER GIVES REACHES THE CARD AND THE SAVED FORM (QA's live round 3 on production 1c71e11,
 * 22 Nov 2026, B6)
 * ============================================================================
 *
 * An exit chat, Pau's account. T6, word for word: "she is resigning due to second job I'm ready for the draft". The reply
 * read back "Filed as: Submitted & Fulfilled Notice" and payroll, never the reason; the saved draft had no
 * resignation_reason and Details did not mention it. Everything else was right (notice 11/16 → 11/23, rehire Yes, key Yes).
 * T1–T5 are rebuilt from QA's facts (the tester's own turns to be swapped in). The person is invented: Ondine Pellfrey.
 * An admin (global) login, as Pau tests. With AGENT_LOOP_LIVE=1 the real model plays every turn.
 */

const REPORT = "QA's live round 3 (prod 1c71e11, 22 Nov 2026, B6): \"she is resigning due to second job\" never reached Reason for Resignation (card, reply or saved draft)";
const ONDINE: DirectoryRow = { id: "e-ondine-pellfrey", firstName: "Ondine", lastName: "Pellfrey", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const BEFORE = [
  "I need an exit form for Ondine Pellfrey",
  "she gave her two weeks notice on 11/16 and her last day is 11/23",
  "she is eligible for rehire",
  "she returned her store key",
  "no payroll deduction",
] as const;
export const B6_T6 = "she is resigning due to second job I'm ready for the draft";

/* The manager's turns (an app check handed back to the model is not one). */
/*
 * QA's B6 measurement (22 Nov 2026): the live model saves "Better paying job elsewhere." for "she found a better paying job
 * elsewhere"; the cases asked for "Found a better paying job elsewhere." word for word and failed runs the manager would call
 * right. Any wording that passes the quote check (`exit-reason-said.ts`: every word of it in the manager's own words) is
 * the manager's reason, so these cases ask for the reason's own content words on the line the manager sees ("Reason for
 * Resignation:") and in the saved field, in any order or case. A missing or wrong reason still fails (`holdsWords`).
 */
const reasonLine = (reply: string): string | null => /Reason for Resignation:?\**:?\**\s*([^\n]*)/i.exec(reply)?.[1]?.trim() || null;
const holdsWords = (text: string | null | undefined, words: string): boolean => {
  const have = new Set((text ?? "").toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
  return words.toLowerCase().split(/\s+/).every((word) => have.has(word));
};

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length;
type Card = { card?: { reads_back?: string[] } | null } | null;

/** The stand-in: the exit card each turn, its reply the card's reads_back; on the turn that gives a reason, exit_reason quoting those words. */
function exitDecision(reasonTurn: number | null, reason: string, quote: string, who: Who) {
  return (view: LoopView): LoopDecision => {
    const result = lastResult(view, "propose_form") as Card;
    if (result) {
      return { text: [`Here's the Resignation/Exit Form for **${who.row.firstName}**.`, ...(result.card?.reads_back ?? [])].join("\n") };
    }
    const turn = users(view);
    return {
      tool: "propose_form",
      input: {
        template_key: "resignation-exit", employee_id: who.row.id, exit_type: "resignation",
        exit_evidence: { ...evidenceFrom(view, who.asks, turn - 1), kind: "asks_for_exit_form" },
        ...(reasonTurn !== null && turn >= reasonTurn ? { exit_reason: reason, exit_reason_evidence: evidenceFrom(view, quote, turn - reasonTurn) } : {}),
      },
    };
  };
}
const exitStandIn = (reasonTurn: number | null, reason: string, quote: string, who: Who) => loopStandIn(exitDecision(reasonTurn, reason, quote, who));

type Who = { readonly row: DirectoryRow; readonly asks: string; readonly before: readonly string[] };
const REBUILT: Who = { row: ONDINE, asks: "exit form for Ondine Pellfrey", before: BEFORE };
/* QA's live re-run 2 of the same chat (`nov22-agent-loop-exit-claims-only-saved-cases.ts`): T1 and T5 word for word, names invented. */
/*
 * The tester's B6 chat (round 3, production 1c71e11, Pau's admin login), every manager turn word for word, names invented:
 * typed "Brianna Holvert", Woven's legal "Breanna Holvert", preferred first name "Jessa" (the tester's "<P2>").
 */
const BREANNA: DirectoryRow = { id: "e-breanna-holvert", firstName: "Breanna", lastName: "Holvert", preferredFirstName: "Jessa", employmentStatus: "active", locationIds: ["loc-219"], positionName: "Team Member Part Time" };
const TESTER: Who = {
  row: BREANNA,
  asks: "can you make me an exit form",
  before: [
    "can you make me an exit form for Brianna Holvert she is in woven under jessa holvert. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time",
    "yes",
    "yes it is for Breanna Holvert",
    "create the exit form for Breanna holvert",
    "last day worked will be nov 23, notice was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in",
  ],
};
const RERUN_2: Who = {
  row: LOOP_THADDEA,
  asks: "can you make me an exit form",
  before: [
    "can you make me an exit form for Thaddea she is in woven under Thaddea Kroll. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time",
    "last day worked will be nov 23, notice was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in",
  ],
};

/*
 * Production's T6 (the tester's reply: only "Filed as" and payroll): the model claimed the reason with no tool call, the
 * claim went back (`exit-read-back.ts`, "call propose_form again … with it") and was left out when it came back. With no
 * reason field there was nothing to call propose_form with. This stand-in claims first, then, handed back, passes exit_reason.
 */
const handedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /exit field/.test(turn.text));
function claimsFirst(reason: string, quote: string, who: Who) {
  const card = exitDecision(who.before.length + 1, reason, quote, who);
  return loopStandIn((view): LoopDecision => {
    if (users(view) === who.before.length + 1 && !handedBack(view) && !lastResult(view, "propose_form")) return { text: `Noted the reason — **Reason for Resignation:** ${reason}.` };
    return card(view);
  });
}

async function chat(t: ReplayContext, last: string, reason: string | null, quote: string, who: Who = REBUILT, claimFirst = false) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, ONDINE, BREANNA]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  t.loopModel!(claimFirst && reason ? claimsFirst(reason, quote, who) : exitStandIn(reason ? who.before.length + 1 : null, reason ?? "", quote, who));
  const thread = t.thread();
  for (const said of who.before) await thread.say(said);
  const reply = await thread.say(last);
  expect(thread.proposal?.templateKey, `no exit card (the case proves nothing):\n${reply.content}`).toBe("resignation-exit");
  const id = await thread.create();
  return { reply, card: thread.proposal as { exitReason?: string } | null, saved: t.values(id), checked: t.checked(id) };
}

export const NOV22_AGENT_LOOP_B6_RESIGNATION_REASON_CASES: ReplayCase[] = [
  {
    id: "nov22-b6-resignation-reason-due-to-second-job",
    title: `B6 verbatim T6 "${B6_T6}": the card, the reply and the saved Reason for Resignation all say the second job`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, card, saved } = await chat(t, B6_T6, "Second job", "she is resigning due to second job");
      expect(holdsWords(card?.exitReason, "second job"), `the card has no reason:\n${reply.content}`).toBe(true);
      expect(holdsWords(reasonLine(reply.content), "second job"), `the reply does not read the reason back:\n${reply.content}`).toBe(true);
      expect(holdsWords(saved.resignation_reason, "second job"), JSON.stringify(saved)).toBe(true);
    },
  },
  {
    id: "nov22-b6-resignation-reason-tester-chat",
    title: `B6, the tester's six turns (a misspelled name, the Woven name, "create the exit form …", T6 "${B6_T6}"): the reply reads the reason back and Create saves it`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, saved } = await chat(t, B6_T6, "Second job", "she is resigning due to second job", TESTER);
      expect(holdsWords(reasonLine(reply.content), "second job"), `the reply does not read the reason back:\n${reply.content}`).toBe(true);
      expect(holdsWords(saved.resignation_reason, "second job"), JSON.stringify(saved)).toBe(true);
    },
  },
  {
    id: "nov22-b6-resignation-reason-claimed-then-handed-back",
    title: "B6, production's path: T6 \"she found a better paying job elsewhere, I'm ready for the draft\" first claimed with no tool call; handed back, the model passes exit_reason and Create saves it",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, saved } = await chat(t, "she found a better paying job elsewhere, I'm ready for the draft", "Found a better paying job elsewhere", "she found a better paying job elsewhere", TESTER, true);
      expect(holdsWords(reasonLine(reply.content), "better paying job elsewhere"), `the reply does not read the reason back:\n${reply.content}`).toBe(true);
      expect(holdsWords(saved.resignation_reason, "better paying job elsewhere"), JSON.stringify(saved)).toBe(true);
    },
  },
  {
    id: "nov22-b6-resignation-reason-rerun-turns",
    title: `B6 with QA's own T1 and T5 before T6 "${B6_T6}": the saved Reason for Resignation is the second job`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, saved } = await chat(t, B6_T6, "Second job", "she is resigning due to second job", RERUN_2);
      expect(holdsWords(reasonLine(reply.content), "second job"), `the reply does not read the reason back:\n${reply.content}`).toBe(true);
      expect(holdsWords(saved.resignation_reason, "second job"), JSON.stringify(saved)).toBe(true);
    },
  },
  {
    id: "nov22-b6-resignation-reason-other-wording",
    title: "B6, another wording: \"she found a better paying job elsewhere, go ahead and draft it\" (no \"due to\" or \"because\"): the card reads back and Create saves the reason in her manager's words",
    report: REPORT,
    status: "fixed",
    async run(t) {
      /* The exit form's own Details reader (`exit-details.ts`) reads none of this sentence; the model's exit_reason does. */
      const said = "she found a better paying job elsewhere, go ahead and draft it";
      const { reply, saved } = await chat(t, said, "Found a better paying job elsewhere", "she found a better paying job elsewhere");
      expect(holdsWords(reasonLine(reply.content), "better paying job elsewhere"), `the reply does not read the reason back:\n${reply.content}`).toBe(true);
      expect(holdsWords(saved.resignation_reason, "better paying job elsewhere"), `${reply.content}\n${JSON.stringify(saved)}`).toBe(true);
    },
  },
  {
    id: "nov22-b6-wrong-reason-never-shown",
    title: "B6 negative control: \"she found a better paying job elsewhere, go ahead and draft it\" with the model passing a reason the manager never gave (\"Relocating for family\"): no such reason is shown or saved, and the content-word check sees that",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, saved } = await chat(t, "she found a better paying job elsewhere, go ahead and draft it", "Relocating for family", "she found a better paying job elsewhere");
      expect(holdsWords(reasonLine(reply.content), "relocating for family"), reply.content).toBe(false);
      expect(holdsWords(saved.resignation_reason, "relocating for family"), JSON.stringify(saved)).toBe(false);
      /* The check itself: a missing reason, or another one, never passes for the manager's words. */
      expect(holdsWords(reasonLine("Here's the card."), "better paying job elsewhere")).toBe(false);
      expect(holdsWords(reasonLine("**Reason for Resignation:** Relocating for family."), "better paying job elsewhere")).toBe(false);
      expect(holdsWords(reasonLine("- **Reason for Resignation:** Better paying job elsewhere."), "better paying job elsewhere")).toBe(true);
    },
  },
  {
    id: "nov22-b6-no-reason-given-stays-blank",
    title: "B6 control: \"I'm ready for the draft\" with no reason given anywhere: Reason for Resignation stays blank",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, saved } = await chat(t, "I'm ready for the draft", null, "");
      expect(reply.content).not.toMatch(/Reason for Resignation/i);
      expect(saved.resignation_reason ?? "", JSON.stringify(saved)).toBe("");
    },
  },
];
