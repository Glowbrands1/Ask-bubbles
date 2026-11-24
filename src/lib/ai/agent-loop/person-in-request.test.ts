import { describe, expect, it } from "vitest";

import { identifiedTurns } from "./evidence";
import { personNamedInRequest, requestStart } from "./person-in-request";

/*
 * CARD_PERSON_THIS_REQUEST_ENABLED (the outside audit's wrong-person risk, 21 Nov 2026; ported from the sibling app).
 * Invented people from the loop roster (`replay-pack/loop-roster.ts`): Fenna Prewitt (the card's person), Ozren Brack (a
 * different roster person). The name checks are the caller's; here they are plain word tests.
 */
const says = (name: string) => (text: string) => text.toLowerCase().includes(name);
const message = (id: string, role: "user" | "assistant", content: string) => ({ id, role, content, timestamp: new Date() });

function run(turns: Array<[string, "user" | "assistant", string]>, current: string, cards: { all?: string[]; fenna?: string[] } = {}) {
  const history = turns.map(([id, role, content]) => message(id, role, content));
  const identified = identifiedTurns(history as never, current, "now");
  const input = { turns: identified, namesThisPerson: says("fenna"), namesAnother: (text: string) => says("ozren")(text) && !says("fenna")(text), cardMessageIds: cards.all ?? [], personCardMessageIds: cards.fenna ?? [] };
  return { start: requestStart(input), named: personNamedInRequest(input) };
}

describe("personNamedInRequest", () => {
  it("the turn that asks names the person", () => {
    expect(run([], "ca for fenna, late on 11/19").named).toBe(true);
  });

  it("a story that names the person, then \"a corrective action\" (the f059 flow): still this request", () => {
    expect(run([["m1", "user", "Fenna was late on 11/19"], ["a1", "assistant", "What do you want made?"]], "a corrective action").named).toBe(true);
  });

  it("a different roster person named in between ends the request: ask who", () => {
    const result = run([["m1", "user", "fenna has been great"], ["a1", "assistant", "Good to hear."], ["m2", "user", "ozren opened today"], ["a2", "assistant", "Okay."]], "make a ca, she was late");
    expect(result.named).toBe(false);
    expect(result.start).toBe(2);
  });

  it("a card ends the request: a name before the card is not this request", () => {
    expect(run([["m1", "user", "fenna was late"], ["a1", "assistant", "Here's the card."]], "another ca, she left early", { all: ["m1"] }).named).toBe(false);
  });

  it("an earlier card for this person counts only while no different person was named since", () => {
    const turns: Array<[string, "user" | "assistant", string]> = [["m1", "user", "ca for fenna"], ["a1", "assistant", "Here's the card."]];
    expect(run(turns, "another ca for her", { all: ["m1"], fenna: ["m1"] }).named).toBe(true);
    expect(run([...turns, ["m2", "user", "ozren was late too"], ["a2", "assistant", "Okay."]], "another ca for her", { all: ["m1"], fenna: ["m1"] }).named).toBe(false);
  });

  it("a name only in the app's reply is never read", () => {
    expect(run([["m1", "user", "who works saturday?"], ["a1", "assistant", "Fenna and Ozren work Saturday."]], "make a ca, she was late").named).toBe(false);
  });

  it("a card that names no turn (an id the chat does not hold) counts only when nobody else was ever named", () => {
    expect(run([["m1", "user", "hello"]], "another ca", { fenna: ["gone"] }).named).toBe(true);
    expect(run([["m1", "user", "ozren was late"]], "another ca", { fenna: ["gone"] }).named).toBe(false);
  });
});
