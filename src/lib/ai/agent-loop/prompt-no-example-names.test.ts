import { describe, expect, it } from "vitest";

import { BUBBLES_CONFIG } from "./app-config";
import { rulesBookText } from "./rules-book";
import { agentLoopTools } from "./run";

/**
 * QA's live round-2 re-run (22 Nov 2026, U23, serious): the reply invented names copied from the rules book's own
 * example for legal_name_in_woven ("**Margo Vale** (Marguerite Vale in Woven)"). The model sees every example as text it
 * may reuse, so no example names a person: placeholders (<First>, <Last>) only. The names below are the examples that were
 * in the rules book and the find_staff description until then.
 */
const FORMER_EXAMPLE_NAMES = /\b(?:Margo|Marguerite|Vale|Imogen|Strathe|Odalys)\b/;

describe("the loop's instructions name no person in an example (U23)", () => {
  it("the rules book", () => {
    expect(rulesBookText(BUBBLES_CONFIG).match(FORMER_EXAMPLE_NAMES)?.[0] ?? null).toBeNull();
  });
  it("the tool descriptions", () => {
    expect(JSON.stringify(agentLoopTools(BUBBLES_CONFIG)).match(FORMER_EXAMPLE_NAMES)?.[0] ?? null).toBeNull();
  });
  it("legal_name_in_woven is a line written from the directory, said as given", () => {
    expect(rulesBookText(BUBBLES_CONFIG)).toMatch(/legal_name_in_woven: say its say_exactly once, word for word/);
  });
});
