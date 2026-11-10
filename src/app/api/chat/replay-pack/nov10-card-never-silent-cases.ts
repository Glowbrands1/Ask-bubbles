import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A CARD TURN ALWAYS ANSWERS THE MANAGER (October rebuild 6, #170, 10 Nov 2026)
 * ============================================================================
 *
 * The sibling's conv_mvoenhk42lu3cxo (25 Oct 2026; #170, never merged): on a CA card, four turns each got the previous
 * card reply word for word. On this app's main f53c409a with production's flags, "Create a Corrective Action Form
 * from this conversation." still does; the other three are answered (no card, nothing added to the card's Issue) and
 * are kept as guards. The manager's words; the employee is the pack's Remy Calder.
 */
const FLAG = "CARD_NEVER_SILENT_ENABLED";
const REPORT = "the sibling app's conv_mvoenhk42lu3cxo (25 Oct 2026, #170)";
const WIRING = "CARD_NEVER_SILENT's reply step is wired in server-ask.ts by its sole writer (coding 2); until then a repeated reply stays as it is";
const REQUEST = "create a ca for remy calder, she was late on 10-20-26";

const issue = (content: string) => /\*\*(?:Issue|Observation of Offense):\*\*\s*([^\n]*)/.exec(content)?.[1]?.trim() ?? "";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

const TURNS = [
  { key: "finalize", text: "i verified everythign i jsut need to finalize it", repeats: false },
  { key: "edit", text: "i need to edit this can you make it to where i can edit", repeats: false },
  { key: "same-way", text: "can you make the form the same way again", repeats: false },
  { key: "create-from-conversation", text: "Create a Corrective Action Form from this conversation.", repeats: true },
] as const;

export const NOV10_CARD_NEVER_SILENT_CASES: ReplayCase[] = TURNS.map((turn) => ({
  id: `nov10-card-never-silent-${turn.key}`,
  title: `on a CA card, "${turn.text}" is answered — never the previous card reply word for word, never added to the Issue`,
  report: `${REPORT}: "${turn.text}"`,
  ...(turn.repeats
    ? { status: { open: "the previous card reply comes back word for word" }, fixFlags: [FLAG], fixStatus: { open: WIRING } }
    : { status: "fixed" as const }),
  async run(t: ReplayContext) {
    const thread = start(t);
    const card = await thread.say(REQUEST);
    const reply = await thread.say(turn.text);
    expect(issue(reply.content), `"${turn.text}" was added to the Issue`).not.toMatch(/verified|need to (?:finali[sz]e|edit)|make it to where/i);
    expect(reply.content, "the previous card reply came back word for word").not.toBe(card.content);
  },
}));
