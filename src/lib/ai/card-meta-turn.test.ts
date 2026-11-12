import { afterEach, describe, expect, it, vi } from "vitest";

import { PRESS_CREATE, WHAT_IS_OUT_OF_DATE, WHAT_IS_WRONG, cardMetaTurn, withPressCreateReply, withoutCardMetaTurns } from "./card-meta-turn";
import type { AskResponse } from "./types";

/** QA's sf-s38, 8 Nov 2026: CREATE_COMMAND_POINTS_TO_CARD_ENABLED and CARD_COMPLAINT_NOT_ACCOUNT_ENABLED. Invented person. */
const T1 = "make me an CA for Rowan Kestrel missing her saturday and sunday shifts due to wanting to go home for the weekend but failed to communicate proporley";
const history = [
  { id: "m1", role: "user", content: T1 },
  { id: "a1", role: "assistant", content: "I'll draft a **Corrective Action Form** for **Rowan Kestrel** …" },
] as never;
const onCard = (question: string) => ({ question, history, continueProposalTemplateKey: "dpoa", questionMessageId: "m9" });

afterEach(() => {
  vi.unstubAllEnvs();
});

function bothOn() {
  vi.stubEnv("CREATE_COMMAND_POINTS_TO_CARD_ENABLED", "true");
  vi.stubEnv("CARD_COMPLAINT_NOT_ACCOUNT_ENABLED", "true");
}

describe("cardMetaTurn", () => {
  it("off: null", () => {
    expect(cardMetaTurn(onCard("create it"))).toBeNull();
    expect(cardMetaTurn(onCard("this proposal is out od fate"))).toBeNull();
  });

  it.each(["create it", "create  the draft", "please create the form", "go ahead and create it", "ok create it", "can you create it?"])(
    "%s → press Create draft, from T1",
    (question) => {
      bothOn();
      const turn = cardMetaTurn(onCard(question));
      expect(turn?.from).toBe(T1);
      const again = { content: "card", citations: [], formProposal: { templateKey: "dpoa", sourceMessageIds: ["m9"] } } as unknown as AskResponse;
      const reply = turn!.answer(again);
      expect(reply.content).toBe(PRESS_CREATE);
      expect(reply.formProposal?.sourceMessageIds).toEqual(["m1"]);
    },
  );

  it.each([
    ["this proposal is out od fate", WHAT_IS_OUT_OF_DATE],
    ["this proposal is out of date", WHAT_IS_OUT_OF_DATE],
    ["the card looks outdated", WHAT_IS_OUT_OF_DATE],
    ["this form is wrong", WHAT_IS_WRONG],
    ["the proposal is not right", WHAT_IS_WRONG],
  ])("%s → asks what to change", (question, line) => {
    bothOn();
    const turn = cardMetaTurn(onCard(question));
    expect(turn?.answer({ content: "card", citations: [], formProposal: { templateKey: "dpoa", sourceMessageIds: [] } } as unknown as AskResponse).content).toBe(line);
  });

  it.each([
    "create a coaching form for Rowan Kestrel",
    "she was also late on 11/2",
    "this proposal is out of date because she called in on sunday",
    "is this proposal out of date?",
    "the policy is wrong, it should be attendance",
  ])("%s → not about the card itself: null", (question) => {
    bothOn();
    expect(cardMetaTurn(onCard(question))).toBeNull();
  });

  it("a draft open, or no card: null", () => {
    bothOn();
    expect(cardMetaTurn({ ...onCard("create it"), activeFormInstanceId: "f-1" })).toBeNull();
    expect(cardMetaTurn({ ...onCard("create it"), continueProposalTemplateKey: undefined })).toBeNull();
  });

  it("each flag alone: only its own kind", () => {
    vi.stubEnv("CREATE_COMMAND_POINTS_TO_CARD_ENABLED", "true");
    expect(cardMetaTurn(onCard("create it"))).not.toBeNull();
    expect(cardMetaTurn(onCard("this proposal is out od fate"))).toBeNull();
  });
});

describe("withoutCardMetaTurns (Create's notes)", () => {
  it("off: unchanged", () => {
    expect(withoutCardMetaTurns(`${T1}\n\nthis proposal is out od fate`)).toBe(`${T1}\n\nthis proposal is out od fate`);
  });
  it("on: the meta turns are no account", () => {
    bothOn();
    expect(withoutCardMetaTurns(`${T1}\n\ncreate it\n\nthis proposal is out od fate`)).toBe(T1);
  });
});

describe("CREATE_FROM_CONVERSATION_POINTS_TO_CARD_ENABLED (the sibling app's P6, QA, 10 Nov 2026)", () => {
  const P6 = "Create a form from this conversation.";

  it("off: P6's wording is not a create command (the card's reply again)", () => {
    bothOn();
    expect(cardMetaTurn(onCard(P6))).toBeNull();
  });

  it.each([P6, "create a form from our chat", "make a new draft from this conversation", "please create the form based on this", "create the draft with this information", "ok, make a form from what we discussed"])(
    "on: %s → answered as before (re-read), then the reply is press Create draft, the card as re-read",
    (question) => {
      bothOn();
      vi.stubEnv("CREATE_FROM_CONVERSATION_POINTS_TO_CARD_ENABLED", "true");
      // Changed on purpose (10 Nov 2026, QA's CI eval s7/s8): the card is the turn's own re-read (its Date, its Policy),
      // never the one in the history; only the reply changes, after the turn is answered.
      expect(cardMetaTurn(onCard(question))).toBeNull();
      const reread = { content: "card", citations: [], formProposal: { templateKey: "dpoa", formDate: "2026-09-20" } } as unknown as AskResponse;
      const reply = withPressCreateReply(reread, onCard(question));
      expect(reply.content).toBe(`${PRESS_CREATE}\n\ncard`);
      expect(reply.formProposal).toEqual(reread.formProposal);
      expect(withoutCardMetaTurns(`${T1}\n${question}`)).toBe(T1);
    },
  );

  it("on: a named form, or a request with an account, is still a request", () => {
    bothOn();
    vi.stubEnv("CREATE_FROM_CONVERSATION_POINTS_TO_CARD_ENABLED", "true");
    for (const question of ["create a coaching form from this conversation", "create a form for Rowan Kestrel", "make a form from this conversation for being late on 11/2"]) {
      expect(cardMetaTurn(onCard(question)), question).toBeNull();
    }
  });
});

/**
 * CREATE_POINTS_TO_SHOWN_CARD_ENABLED — QA's #745 follow-up (12 Nov 2026): "Create a form from this conversation." after
 * "write ca" said "press **Create draft** on the card" while the card only asked "Who is this … for?" (no button).
 */
describe("CREATE_POINTS_TO_SHOWN_CARD_ENABLED", () => {
  const asksWho = { templateKey: "dpoa", employeeName: null, status: "needs_employee", supportsInlineDraft: false };
  const ready = { templateKey: "dpoa", employeeName: "Rowan Kestrel", status: "ready", supportsInlineDraft: true };
  const reply = (formProposal: object) => ({ content: "Who is this **Corrective Action Form** for?", formProposal });
  const request = { question: "Create a form from this conversation.", continueProposalTemplateKey: "dpoa" };

  function createOn() {
    vi.stubEnv("CREATE_COMMAND_POINTS_TO_CARD_ENABLED", "true");
    vi.stubEnv("CREATE_FROM_CONVERSATION_POINTS_TO_CARD_ENABLED", "true");
  }

  it("off: the line leads even when the card asks who it is for (as before)", () => {
    createOn();
    expect(withPressCreateReply(reply(asksWho), request).content.startsWith(PRESS_CREATE)).toBe(true);
  });

  it("on: no line pointing to a Create button the card does not show", () => {
    createOn();
    vi.stubEnv("CREATE_POINTS_TO_SHOWN_CARD_ENABLED", "true");
    expect(withPressCreateReply(reply(asksWho), request).content).toBe("Who is this **Corrective Action Form** for?");
    expect(withPressCreateReply(reply(ready), request).content.startsWith(PRESS_CREATE)).toBe(true);
  });

  it("on: \"create it\" with a who-is-it-for card on screen is not answered as a card turn", () => {
    createOn();
    const withCard = [
      { id: "m1", role: "user", content: "write ca" },
      { id: "a1", role: "assistant", content: "Who is this for?", formProposal: asksWho },
    ] as never;
    const turn = { question: "create it", history: withCard, continueProposalTemplateKey: "dpoa", questionMessageId: "m9" };
    expect(cardMetaTurn(turn)).not.toBeNull();
    vi.stubEnv("CREATE_POINTS_TO_SHOWN_CARD_ENABLED", "true");
    expect(cardMetaTurn(turn)).toBeNull();
  });
});
