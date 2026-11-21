import { describe, expect, it } from "vitest";

import { firstNameNotPronouns } from "@/lib/forms/first-name-write-up";

import { withoutPersonPronouns } from "./reply-pronouns";

/*
 * QA2's live re-test of this app (21 Nov 2026), with the sibling app's second-mention fix ported: three live wordings
 * named the person a second time as a possessive. Names invented (the loop cases' roster, `replay-pack/loop-roster.ts`).
 *   "<P> was late on <P>'s last two shifts"
 *   "<P> wanted to show <P>'s team <P>'s new puppy"   (from "she wanted to show her team her new puppy")
 *   "<P> was talking on <P>'s cell phone"
 * The first and third are a possessive right after a preposition (the ported rule). The second is not: its possessives
 * follow a showing/giving verb ("show her team") and the clause's earlier object ("team her new puppy"); this app extends
 * the rule to those two places only. "She said her car broke down" still keeps the owner (the sibling's own test).
 */
const second = (line: string, name: string) => withoutPersonPronouns(line, name).text;

describe("withoutPersonPronouns: QA2's three live wordings (21 Nov 2026)", () => {
  it("\"she was late on her last two shifts\" reads \"Fenna was late on the last two shifts\"", () => {
    expect(second("She was late on her last two shifts.", "Fenna")).toBe("Fenna was late on the last two shifts.");
    expect(second("Fenna was late on her last two shifts.", "Fenna")).toBe("Fenna was late on the last two shifts.");
  });

  it("\"she wanted to show her team her new puppy\" reads \"Thaddea wanted to show the team the new puppy\"", () => {
    expect(second("She wanted to show her team her new puppy.", "Thaddea")).toBe("Thaddea wanted to show the team the new puppy.");
    expect(second("Thaddea left the register because she wanted to show her team her new puppy.", "Thaddea")).toBe(
      "Thaddea left the register because Thaddea wanted to show the team the new puppy.",
    );
  });

  it("\"she was talking on her cell phone\" reads \"Fenna was talking on the cell phone\"", () => {
    expect(second("She was talking on her cell phone during her shift.", "Fenna")).toBe("Fenna was talking on the cell phone during the shift.");
  });

  it("a possessive that opens the sentence, or follows a reporting verb, keeps its owner", () => {
    expect(second("She said her car broke down.", "Fenna")).toBe("Fenna said Fenna's car broke down.");
    expect(second("Her team saw it.", "Fenna")).toBe("Fenna's team saw it.");
    expect(second("She showed her badge.", "Fenna")).toBe("Fenna showed the badge.");
  });

  it("the saved write-up (forms rewrite, then the reply pass) reads the same, with no repeated-name possessive", () => {
    const keys = new Set(["observation"]);
    const saved = (line: string, name: string) => firstNameNotPronouns({ observation: line }, name, keys).values.observation ?? "";
    for (const [line, name, first] of [
      ["Observed:\nShe was late on her last two shifts.", "Fenna Prewitt", "Fenna"],
      ["Observed:\nShe wanted to show her team her new puppy.", "Thaddea Kroll", "Thaddea"],
      ["Observed:\nShe was talking on her cell phone.", "Fenna Prewitt", "Fenna"],
    ] as const) {
      const text = saved(line, name);
      expect(text, text).toMatch(new RegExp(`\\b${first}\\b`));
      expect(text, text).not.toMatch(new RegExp(`\\b${first}'s\\b`));
      expect(text, text).not.toMatch(/\b(?:she|her|he|him|his)\b/i);
    }
  });
});
