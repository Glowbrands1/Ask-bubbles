import { describe, expect, it } from "vitest";

import {
  claimsAnotherChat,
  isBareNameTurn,
  refersBack,
  withoutCrossChatClaims,
} from "./cross-chat-guard";

/**
 * ============================================================================
 * QA: THE REPLY BROUGHT OTHER CHATS INTO THE TEXT
 * ============================================================================
 *
 * Ported from Ask Sunny (conv_mvmtj8ia2qwr8pu, conv_mvmw29wp27tkony,
 * conv_mvmvugx525mtd2v): the same turns, in this app's words, with invented
 * people. And this app's own production case, conv_mvmo31du2s97yka: a fresh
 * chat about Test Employee at Grand Island was told "last time you told me
 * about Test Employee, it was at Dodge, NE and then Kearney".
 */

const SITUATION =
  "an employee (Wren)  is talking negatively about co workers and customers. another employee, marlo, complained to the store manager about Wren";

const REPLY_OCT_23 = `You raised this same situation with me on October 23, and in that conversation you asked for a coaching form for Wren Calder. Worth checking the Forms Register to see whether that one was actually created.

For the conversation itself, keep it on behavior and impact, not personality.`;

const REPLY_AUG_26 = `I'm not sure what you're after — that came through as a stray keystroke. (You sent the same thing back on August 26, so if there was a real question behind it, it didn't make it through either time.)

Tell me what you need and I'll take it from there.`;

const GRAND_ISLAND = "Test Employee at Grand Island out of dress code 3 shifts, coached on 2nd";

const REPLY_GRAND_ISLAND = `Good context to flag: last time you told me about Test Employee, it was at Dodge, NE and then Kearney — different locations for different incidents. Now you're naming Grand Island, NE, which VERIFIED RECORDS confirms is Store 236. If this is a separate, third incident, that's fine — just confirming it's not a mix-up, since the location differs from what you told me before.

On the substance: three shifts out of dress code with coaching already given on the second is exactly the kind of pattern the framework says shouldn't stay informal.`;

const TODAY = "2026-10-24";

describe("withoutCrossChatClaims — the production replies", () => {
  it('takes out "last time you told me about Test Employee, it was at Dodge, NE and then Kearney" (conv_mvmo31du2s97yka)', () => {
    const { content } = withoutCrossChatClaims(REPLY_GRAND_ISLAND, {
      question: GRAND_ISLAND,
      history: [],
      todayIso: TODAY,
    });
    expect(content).not.toMatch(/last time you told me|Dodge|Kearney|what you told me before/i);
    expect(content).toContain("Now you're naming Grand Island, NE, which VERIFIED RECORDS confirms is Store 236.");
    expect(content).toContain(
      "On the substance: three shifts out of dress code with coaching already given on the second is exactly the kind of pattern the framework says shouldn't stay informal.",
    );
  });

  it('takes out "You raised this same situation with me on October 23" and keeps every other word', () => {
    const { content, removed } = withoutCrossChatClaims(REPLY_OCT_23, {
      question: SITUATION,
      history: [],
      todayIso: TODAY,
    });
    expect(removed).toHaveLength(1);
    expect(content).toBe(
      REPLY_OCT_23.replace(
        "You raised this same situation with me on October 23, and in that conversation you asked for a coaching form for Wren Calder. ",
        "",
      ),
    );
  });

  it('takes out "(You sent the same thing back on August 26, …)" after a lone "asdasd"', () => {
    const { content } = withoutCrossChatClaims(REPLY_AUG_26, { question: "asdasd", history: [], todayIso: TODAY });
    expect(content).not.toMatch(/you sent|August 26/i);
    expect(content.startsWith("I'm not sure what you're after — that came through as a stray keystroke.")).toBe(true);
    expect(content).toContain("Tell me what you need and I'll take it from there.");
  });
});

describe("withoutCrossChatClaims — what stays", () => {
  it("keeps a prior form listed as a record", () => {
    const reply =
      "**Possibly on file — not added:** Coaching Form dated 2026-10-01 (Store 236). I can't confirm these are this employee's, so I won't put it on the form.";
    expect(withoutCrossChatClaims(reply, { question: SITUATION, history: [], todayIso: TODAY }).content).toBe(reply);
  });

  it("keeps a date the manager gave in this conversation", () => {
    const reply = "You mentioned on October 21 that she was late. That is the second late arrival.";
    const history = [{ role: "user", content: "Wren Calder was late on 10/21" }];
    expect(withoutCrossChatClaims(reply, { question: "what now", history, todayIso: TODAY }).content).toBe(reply);
  });

  it("keeps 'the same thing' when the manager repeated it in this conversation", () => {
    const reply = "You sent the same thing twice, so I think it was a stray keystroke.";
    const history = [{ role: "user", content: "asdasd" }, { role: "assistant", content: "Not sure what you mean." }];
    expect(withoutCrossChatClaims(reply, { question: "asdasd", history, todayIso: TODAY }).content).toBe(reply);
  });

  it("keeps advice that only says what the manager asked here", () => {
    const reply = "You asked for a coaching form for Wren Calder. Here is what I would put on it.";
    expect(claimsAnotherChat(reply, { question: SITUATION, history: [], todayIso: TODAY })).toBe(false);
  });
});

describe("refersBack and isBareNameTurn", () => {
  it("reads the manager pointing back at an earlier chat", () => {
    for (const said of [
      "Wren is talking negatively again",
      "same as last time with Wren",
      "do it like before",
      "in my other chat I said she was late",
      "I told you about Wren yesterday",
    ]) {
      expect(refersBack(said, [])).toBe(true);
    }
    expect(refersBack(SITUATION, [])).toBe(false);
    expect(refersBack(GRAND_ISLAND, [])).toBe(false);
    expect(refersBack("asdasd", [])).toBe(false);
  });

  it("knows a turn that is nothing but the name", () => {
    expect(isBareNameTurn("asdasd", "asdasd")).toBe(true);
    expect(isBareNameTurn("Wren Calder.", "Wren Calder")).toBe(true);
    expect(isBareNameTurn(GRAND_ISLAND, "Test Employee")).toBe(false);
  });
});
