import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { rosterNames } from "./store-alias";
const P = [
  "she was late because she was at kearney high",
  "she was at sioux falls west for a game",
  "she left early for a meeting at omaha central",
  "she was stuck in west dodge road construction",
  "late because of west dodge road construction",
  "she was late at kearney today",
  "at the west dodge store, she was late",
  "at the kearney store she was late",
  "ca for kira dunmore at kearney",
  "ca for kira dunmore at kearney.",
  "ca for kira dunmore at kearney, late",
  "ca for kira dunmore at kearney 11/1/26 late",
  "verbal ca for kira dunmore at west dodge 11/1/26",
  "ca for kira dunmore at kearney - late on 11/1",
  "ca for kira dunmore at kearney monday she was late",
  "ca for kira dunmore at kearney ne late again",
  "ca for kira dunmore kearney location late",
  "she was late at west dodge yesterday",
  "she was late to west dodge",
  "she works at west dodge and was late",
  "coaching for kira dunmore at west dodge rd",
  "coaching for kira dunmore at west dodge rd store",
  "coaching for kira dunmore at sioux falls 41st",
  "coaching for kira dunmore at sioux falls w 41st st on 11/2",
  "coaching for kira dunmore at w 41st st for being late",
  "coaching for kira dunmore at dodge ne, she was late",
  "coaching for kira dunmore at kearney\nshe was late",
  "coaching for kira dunmore at kearney (late)",
  "coaching for kira dunmore at kearney not wearing her apron",
  "coaching for kira dunmore at kearney - no call no show",
  "coaching for kira dunmore at kearney store 66",
];
it("probe", () => {
  process.env.STORE_ALIAS_ENABLED = "true";
  const rows: string[] = [];
  for (const p of P) {
    delete process.env.PLACE_STRIP_WHOLE_PHRASE_ONLY_ENABLED;
    const off = rosterNames(p);
    process.env.PLACE_STRIP_WHOLE_PHRASE_ONLY_ENABLED = "true";
    const on = rosterNames(p);
    rows.push(`${off === on ? "same" : "DIFF"} | ${JSON.stringify(p)}\n   off: ${JSON.stringify(off)}\n   on:  ${JSON.stringify(on)}`);
  }
  writeFileSync(process.env.PROBE_OUT as string, rows.join("\n"));
});
