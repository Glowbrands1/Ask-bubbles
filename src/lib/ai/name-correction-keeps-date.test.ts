import { afterEach, describe, expect, it, vi } from "vitest";

import type { AskRequest, AskResponse } from "./types";
import { withNameCorrectionDate } from "./name-correction-keeps-date";

/* NAME_CORRECTION_KEEPS_DATE_ENABLED (QA, 11 Nov 2026; s14 path 1). The manager's wording; the person is invented. */
const ASK = "Is this for **Rozlyn Quellmar**? Tell me if that should change.";
const history = [
  { id: "u1", role: "user", content: "help me create a coaching form" },
  { id: "a1", role: "assistant", content: "Here is what I would put on a **Coaching Form**." },
  { id: "u2", role: "user", content: "October 1st" },
  { id: "a2", role: "assistant", content: "I still need to know who this is for before I can make this card." },
  { id: "u3", role: "user", content: "ok, create a follow-up coaching form for rozline quellmar. i trained her on the new promo" },
  { id: "a3", role: "assistant", content: ASK },
] as AskRequest["history"];
const request = (turns = history) => ({ history: turns, context: { todayIso: "2026-11-10" } }) as unknown as Pick<AskRequest, "history" | "context">;
const card = (employeeName: string | null, formDate: string | null = null) =>
  ({ content: "Here is what I would put on a **Coaching Form**.", citations: [], formProposal: { templateKey: "coaching", employeeName, formDate } }) as unknown as AskResponse;

describe("NAME_CORRECTION_KEEPS_DATE_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());
  const on = (value: boolean) => vi.stubEnv("NAME_CORRECTION_KEEPS_DATE_ENABLED", value ? "true" : "");

  it("the answer's card for Rozlyn Quellmar keeps the date given before the question", () => {
    on(true);
    expect(withNameCorrectionDate(card("Rozlyn Quellmar"), request()).formProposal?.formDate).toBe("2026-10-01");
  });

  it("a later card for her (no date of its own) keeps it too", () => {
    on(true);
    const later = [...history, { id: "u4", role: "user", content: "Oops, it's Rozlyn quellmar" }, { id: "a4", role: "assistant", content: "Here is what I would put on a **Coaching Form**." }] as AskRequest["history"];
    expect(withNameCorrectionDate(card("Rozlyn Quellmar"), request(later)).formProposal?.formDate).toBe("2026-10-01");
  });

  it("a date the card already has is the card's; another person's card is untouched; off, as built", () => {
    on(true);
    expect(withNameCorrectionDate(card("Rozlyn Quellmar", "2026-11-03"), request()).formProposal?.formDate).toBe("2026-11-03");
    expect(withNameCorrectionDate(card("Tess Varga"), request()).formProposal?.formDate ?? null).toBeNull();
    on(false);
    const built = card("Rozlyn Quellmar");
    expect(withNameCorrectionDate(built, request())).toBe(built);
  });

  it("no name question in the conversation: nothing is filled", () => {
    on(true);
    const plain = history.slice(0, 5) as AskRequest["history"];
    expect(withNameCorrectionDate(card("Rozlyn Quellmar"), request(plain)).formProposal?.formDate ?? null).toBeNull();
  });
});
