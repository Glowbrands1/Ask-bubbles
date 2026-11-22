import { describe, expect, it } from "vitest";

import { asManagerCommaWrote, lastCommaFirst } from "./tools";

/* QA's Bubbles re-run (22 Nov 2026, C3): "create a CA form for <Last>, <First> at dodge. she was late on 10-16". */
describe("lastCommaFirst (C3)", () => {
  it("two single words around one comma read as Last, First", () => {
    expect(lastCommaFirst("larkspur, vesna")).toBe("vesna larkspur");
    expect(lastCommaFirst("Larkspur,Vesna")).toBe("Vesna Larkspur");
    expect(lastCommaFirst("O'Dell, Mary-Kate")).toBe("Mary-Kate O'Dell");
  });

  it("any other shape is kept as typed", () => {
    expect(lastCommaFirst("Vesna Larkspur")).toBe("Vesna Larkspur");
    expect(lastCommaFirst("Larkspur, Vesna Jo")).toBe("Larkspur, Vesna Jo");
    expect(lastCommaFirst("Vesna, the shift lead")).toBe("Vesna, the shift lead");
  });
});

/* QA's live round 3 (22 Nov 2026, C3): the model passed "<First> <Last>" for the manager's "<Last>, <First>". */
describe("asManagerCommaWrote (C3, round 3)", () => {
  const said = "create a CA form for Quillane, Odessa at dodge. she was late on 10-16";
  it("a first-last name the manager wrote only as Last, First is read in the manager's order", () => {
    expect(asManagerCommaWrote("Odessa Quillane", said)).toBe("Quillane, Odessa");
    expect(asManagerCommaWrote("odessa quillane", said)).toBe("Quillane, Odessa");
  });

  it("a name the manager wrote as passed, or never wrote with a comma, is kept", () => {
    expect(asManagerCommaWrote("Odessa Quillane", "create a CA form for Odessa Quillane, she was late")).toBe("Odessa Quillane");
    expect(asManagerCommaWrote("Odessa Quillane", "create a CA form for Odessa at dodge")).toBe("Odessa Quillane");
    expect(asManagerCommaWrote("Quillane, Odessa", said)).toBe("Quillane, Odessa");
    expect(asManagerCommaWrote("Odessa", said)).toBe("Odessa");
    expect(asManagerCommaWrote("Dessa Quillane", said)).toBe("Dessa Quillane");
  });
});
