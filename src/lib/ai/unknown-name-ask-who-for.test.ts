import { afterEach, describe, expect, it, vi } from "vitest";

import { stillAsks } from "@/lib/forms/reply-guards";

import type { AskRequest, AskResponse } from "./types";
import { withUnknownNameAsk } from "./unknown-name-ask";

/** QA's round-6 audit (8 Nov 2026), the BF7 chain (27 Oct 2026); the name is invented. */
const ASK =
  "Who is this **Corrective Action Form** for? Give me their name and I'll draft it from what you've told me — you can set the warning level and anything else on the form itself.";
const FIRST = "i need to issue a ca for someone being late";
const NAMED = "quinn marlowe was late on 10/20 and the store was opened late";
const req = (question: string, history: { role: string; content: string }[]) => ({ question, history }) as unknown as AskRequest;
const card = (content: string) => ({ content, formProposal: { employeeName: null } }) as unknown as AskResponse;

/** The chain's replies, each wrapped as the route does. */
function chain(): string[] {
  const history: { role: string; content: string }[] = [];
  const out: string[] = [];
  for (const turn of [FIRST, NAMED, "she was issued a verbal ca on 10.1 for this same thing", "yes payroll deduct", "i dont know the amount", "dodge"]) {
    const reply = withUnknownNameAsk(card(ASK), req(turn, history)).content;
    out.push(reply);
    history.push({ role: "user", content: turn }, { role: "assistant", content: reply });
  }
  return out;
}

afterEach(() => vi.unstubAllEnvs());

describe("UNKNOWN_NAME_ASK_WHO_FOR", () => {
  it("off: the live repeat says \"I still need\" beside no \"Who is this … for?\" (the audit's finding)", () => {
    vi.stubEnv("UNKNOWN_NAME_ASK_ENABLED", "true");
    const out = chain();
    expect(out.some((reply) => /^I still need a name that is on the directory/m.test(reply) && stillAsks(reply) === null)).toBe(true);
  });

  it("on: the name is named back once, no reply repeats the one before, and every reply asks who the form is for", () => {
    vi.stubEnv("UNKNOWN_NAME_ASK_ENABLED", "true");
    vi.stubEnv("UNKNOWN_NAME_ASK_WHO_FOR_ENABLED", "true");
    const out = chain();
    expect(out.filter((reply) => /I couldn't match \*\*quinn marlowe\*\*/.test(reply))).toHaveLength(1);
    for (let index = 1; index < out.length; index += 1) expect(out[index]).not.toBe(out[index - 1]);
    for (const reply of out) expect(stillAsks(reply), reply).not.toBeNull();
  });

  it("on without UNKNOWN_NAME_ASK: the reply is unchanged", () => {
    vi.stubEnv("UNKNOWN_NAME_ASK_WHO_FOR_ENABLED", "true");
    const answer = card(ASK);
    expect(withUnknownNameAsk(answer, req(NAMED, [{ role: "user", content: FIRST }, { role: "assistant", content: ASK }]))).toBe(answer);
  });
});
