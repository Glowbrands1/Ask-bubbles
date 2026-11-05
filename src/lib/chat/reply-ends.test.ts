import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { replyCutCheckEnabled } from "@/lib/config/chat-quality-flags";
import { formOpportunityLead } from "@/lib/forms/form-opportunity";

import { checkedReplyEnd } from "./reply-ends";

/**
 * REPLY_CUT_CHECK_ENABLED (sf-b6, QA, 5 Nov 2026). The production reply ended
 * "Based on what you've described, I can prepare:" — the model had finished
 * (`end_turn`); the heading was the form picker's, offered while a Corrective
 * Action was on its proposal card. The manager's message, name invented:
 */
const SF_B6_SAID =
  "can you have it include that we recieved a customer complaint from Sunday 11-1, she started closing the last register at 4:56pm and we cant close until the store is closed at 5pm, we had a customer come in at 4:59 and was told them that we were closed";
const SF_B6_REPLY = [
  "I'll include that as the factual account — but the \"policy breached in the manual's own words\" field needs an actual cited policy.",
  "",
  "Let me know and I'll fold it all together — then just say \"create the corrective action form for Talia Brennick\" when you're ready.",
  "",
  "Based on what you've described, I can prepare:",
].join("\n");
const SELECTION = { primary: { templateKey: "dpoa" }, additional: [{ templateKey: "coaching" }] };

describe("checkedReplyEnd — sf-b6", () => {
  it(`"${SF_B6_SAID.slice(0, 40)}…" with a Corrective Action in progress: no picker, no heading, every model word kept`, () => {
    const { answer, removed } = checkedReplyEnd({ content: SF_B6_REPLY, formSelection: SELECTION }, { formInProgress: true });
    expect(answer.formSelection).toBeUndefined();
    expect(answer.content.endsWith("when you're ready.")).toBe(true);
    expect(answer.content).toBe(SF_B6_REPLY.replace(/\n\nBased on what you've described, I can prepare:$/, ""));
    expect(removed).toEqual([formOpportunityLead()]);
  });

  it("the heading in the middle of a reply (2 Nov) is taken out too, while a form is in progress", () => {
    const content = `**Nothing on the form has changed yet.**\n\n${formOpportunityLead()}\n\nSay **make that update** and I'll write it into the draft.`;
    const { answer } = checkedReplyEnd({ content, formSelection: SELECTION }, { formInProgress: true });
    expect(answer.content).toBe("**Nothing on the form has changed yet.**\n\nSay **make that update** and I'll write it into the draft.");
    expect(answer.formSelection).toBeUndefined();
  });

  it("with nothing in progress, the picker and its heading stay: the cards come with it", () => {
    const content = `A Corrective Action Form fits.\n\n${formOpportunityLead()}`;
    const reply = { content, formSelection: SELECTION };
    const { answer, removed } = checkedReplyEnd(reply, { formInProgress: false });
    expect(answer).toBe(reply);
    expect(removed).toEqual([]);
  });
});

describe("checkedReplyEnd — a heading with nothing under it", () => {
  it("is taken out when no card comes with the reply", () => {
    const { answer, removed } = checkedReplyEnd({ content: "Got it.\n\nHere's what I can put on the form:" }, { formInProgress: false });
    expect(answer.content).toBe("Got it.");
    expect(removed).toEqual(["Here's what I can put on the form:"]);
  });

  it("stays when a proposal card comes with the reply", () => {
    const reply = { content: "Got it.\n\nHere's the card:", formProposal: { templateKey: "dpoa" } };
    expect(checkedReplyEnd(reply, { formInProgress: false }).answer).toBe(reply);
  });

  it.each([
    ["a list", "Still need:\n- **Verbal or Written warning?**\n- **Payroll deduct — Yes or No?**"],
    ["a table", "| Field | Value |\n| --- | --- |\n| Store | West Dodge |"],
    ["a citation marker", "Arrive on time for every scheduled shift. [p.12]"],
    ["a time", "She clocked out at 9:01"],
    ["a question", "Is this a Verbal or Written warning?"],
  ])("leaves a reply ending in %s exactly as it was", (_shape, content) => {
    const reply = { content };
    const { answer, removed } = checkedReplyEnd(reply, { formInProgress: true });
    expect(answer).toBe(reply);
    expect(removed).toEqual([]);
  });

  it("never leaves a reply empty", () => {
    const reply = { content: "Here's what I can prepare:" };
    expect(checkedReplyEnd(reply, { formInProgress: false }).answer).toBe(reply);
  });
});

describe("REPLY_CUT_CHECK_ENABLED off", () => {
  const saved = process.env.REPLY_CUT_CHECK_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.REPLY_CUT_CHECK_ENABLED;
    else process.env.REPLY_CUT_CHECK_ENABLED = saved;
  });

  it.each([undefined, "", "0", "false", "off", "no"])("reads off for %s", (value) => {
    if (value === undefined) delete process.env.REPLY_CUT_CHECK_ENABLED;
    else process.env.REPLY_CUT_CHECK_ENABLED = value;
    expect(replyCutCheckEnabled()).toBe(false);
  });

  it("the chat route reaches the check only through the flag, and nothing else loads it", () => {
    const route = readFileSync("src/app/api/chat/route.ts", "utf8");
    const at = route.indexOf('import("@/lib/chat/reply-ends")');
    expect(at).toBeGreaterThan(0);
    expect(route.indexOf('import("@/lib/chat/reply-ends")', at + 1)).toBe(-1);
    expect(route).not.toMatch(/from "@\/lib\/chat\/reply-ends"/);
    const guard = route.lastIndexOf("if (replyCutCheckEnabled()) {", at);
    expect(guard).toBeGreaterThan(0);
    // The guarded block opens no other block before the import.
    expect(route.slice(guard, at).split("{").length - 1).toBe(1);
  });
});
