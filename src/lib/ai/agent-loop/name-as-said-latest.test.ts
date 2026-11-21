import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { nameAsSaid } from "./tools";

/*
 * QA's live re-test B6 (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): "The card was <C> after turns 3–4,
 * then turns 5–6 switched back to <A> (\"<A> (<C> in Woven)\") unasked; the saved draft says <A>." Expected: keep the
 * manager's last explicit name. QA's turns, invented people: Woven's legal first name Isolde, preferred Brisa.
 */
const ISOLDE = { firstName: "Isolde", lastName: "Quennell", preferredFirstName: "Brisa" };
const TURNS = [
  "can you make me an exit form for Brisa Quennell she is in woven under Isolda Quennell. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time",
  "yes",
  "yes it is for Isolde Quennell",
  "create the exit form for Isolde Quennell",
  "last day worked will be nov 23, notice was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in",
  "she is resigning due to second job I'm ready for the draft",
];

describe("the card's name is the one the manager used last (B6, item 19)", () => {
  it("before the manager names the legal name, the preferred name they typed", () => {
    expect(nameAsSaid(ISOLDE, TURNS.slice(0, 2).join("\n"))).toBe("Brisa Quennell");
  });
  it.each([3, 4, 5, 6])("after %i turns, the legal name the manager settled on stays", (count) => {
    expect(nameAsSaid(ISOLDE, TURNS.slice(0, count).join("\n"))).toBe("Isolde Quennell");
  });
  it("a later turn using the preferred name again moves the card back to it", () => {
    expect(nameAsSaid(ISOLDE, [...TURNS, "actually put Brisa Quennell on it"].join("\n"))).toBe("Brisa Quennell");
  });
  it("neither name typed (a pronoun): the preferred name, as before", () => {
    expect(nameAsSaid(ISOLDE, "exit form for her, last day nov 23")).toBe("Brisa Quennell");
  });
});
