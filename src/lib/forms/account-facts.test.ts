import { describe, expect, it } from "vitest";

import { factOfClause, type FactContext } from "./account-facts";

/* v2-Gate-Sunny-3's probes (14 Nov 2026), in its wording; places and titles here are the test's own. */
const CONTEXT: FactContext = {
  onlyPlace: (text) => /^(?:the\s+)?(?:west\s+dodge|elm\s+street)(?:\s+store)?$/i.test(text.trim()),
  onlyTitle: (text) => /^(?:team\s+member|assistant\s+manager|key\s+holder)$/i.test(text.trim()),
};
const fact = (clause: string) => factOfClause(clause, CONTEXT);

describe("factOfClause", () => {
  it.each([
    ["she yelled at a customer i guess", "she yelled at a customer"],
    ["she yelled at a customer, maybe twice", "she yelled at a customer"],
    ["she yelled at a customer as a TM", "she yelled at a customer"],
    ["she yelled at a customer as a team member", "she yelled at a customer"],
    ["she yelled at a customer at west dodge", "she yelled at a customer"],
    ["she yelled at a customer, written", "she yelled at a customer"],
    ["also she didn't clean", "she didn't clean"],
    ["make it a written warning, she yelled at a customer", "she yelled at a customer"],
    ["this is a final warning she yelled at a customer", "she yelled at a customer"],
    ["she yelled at a customer as a joke", "she yelled at a customer as a joke"],
    ["she was on her phone at the register", "she was on her phone at the register"],
    ["she did not clean the counter", "she did not clean the counter"],
    ["she didn't answer the phone", "she didn't answer the phone"],
  ])("%s → %s", (said, expected) => {
    expect(fact(said)).toBe(expected);
  });

  it.each([
    "she maybe forgot",
    "i think she yelled at a customer",
    "she might have yelled at a customer",
    "she probably forgot to clean the counter",
    "not sure but she yelled at a customer",
    "possibly she left the drawer open",
    "apparently she yelled at a customer",
    "she had a verbal last month",
    "last week she also yelled at a customer",
    "she has been late 3 times this month",
    "she was previously warned about her phone",
    "she was not late",
    "she didn't yell at a customer",
    "it happened at west dodge",
    "it was on 11/3",
    "she works as a team member",
    "she gets a verbal warning",
  ])("%s → no fact", (said) => {
    expect(fact(said)).toBeNull();
  });
});
