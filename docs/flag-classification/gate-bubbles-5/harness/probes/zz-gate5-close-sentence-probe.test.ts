import { describe, expect, it } from "vitest";
import { closeSentence } from "./close-sentence";
// GATE-ONLY (v2-Gate-Bubbles-5). Sentences as accountReplaced gives them: lowercased, punctuation → spaces.
const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const same: [string, string][] = [
  ["Odalys Quenby was texting on the cell phone the whole shift on 11/3/26.", "Odalys Quenby was texting on the cell phone the whole shift on November 4, 2026."],
  ["… on 11/3/26.", "… on Nov 4th."], ["… on 11/3/26.", "… on the 4th."], ["… on 11/3/26.", "… on 11/4."],
  ["… on Tuesday, 11/3/26.", "… on Wednesday, November 4th."], ["… on November 3, 2026.", "… on 11/4/26."],
  ["… on the 3rd of November.", "… on the 4th of November."], ["… on 3 Nov 2026.", "… on 4 November 2026."],
  ["she arived late on 11/3/26", "she arrived late on November 4, 2026"],
];
const different: [string, string][] = [
  ["Odalys Quenby arrived late for the shift on 11/3/26.", "Odalys Quenby was texting on the cell phone the whole shift on November 4, 2026."],
  ["Odalys Quenby arrived late for the shift on 11/3/26.", "Odalys Quenby was texting on the cell phone the whole shift on Nov 4th."],
  ["Odalys Quenby arrived late for the shift on 11/3/26.", "Odalys Quenby was texting on the cell phone the whole shift on 11/3/26."],
  ["she was late on 11/3/26", "she was rude on 11/4/26"],
  ["she was late on 11/3/26", "she was on her phone on 11/4/26"],
  // numbers that are not dates
  ["she was 10-15 minutes late", "she was on her phone for 10-15 minutes"],
  ["she missed the 10 minute sanitation on 11/3", "she was on her phone for 10 minutes on 11/3"],
  ["she took a 30 minute break and was late", "she took a 30 minute break and was on her phone"],
];
describe("gate5 closeSentence probes", () => {
  for (const [a, b] of same) it(`same: ${a} → ${b}`, () => expect(closeSentence(n(a), n(b))).toBe(true));
  for (const [a, b] of different) it(`different: ${a} → ${b}`, () => expect(closeSentence(n(a), n(b))).toBe(false));
});
