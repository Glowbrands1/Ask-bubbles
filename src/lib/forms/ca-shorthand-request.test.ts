import { afterEach, describe, expect, it, vi } from "vitest";

import { detectTemplateIntent } from "./template-intent";

/* October triage #9 (#181), the reporter's wording. */
const REQUESTS = [
  "an employee opened the store 15 min late and needs CA",
  "write ca",
  "crete a ca for tamsin oakridge she didnt do the deep clean",
  "writen ca tamsin oakridge not atending monthly meeting 10-20-26",
];

describe("CA_SHORTHAND_REQUEST_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(REQUESTS)("off: %s is not a request, as before", (said) => {
    vi.stubEnv("CA_SHORTHAND_REQUEST_ENABLED", "false");
    expect(detectTemplateIntent(said)).toEqual({ kind: "corrective_action", requestedCreation: false });
  });

  it.each(REQUESTS)("on: %s asks for the form", (said) => {
    vi.stubEnv("CA_SHORTHAND_REQUEST_ENABLED", "true");
    expect(detectTemplateIntent(said)).toEqual({ kind: "corrective_action", requestedCreation: true });
  });

  it.each(["she doesn't need ca for this", "what is a ca?", "she had a ca in august"])("on: %s is not a request", (said) => {
    vi.stubEnv("CA_SHORTHAND_REQUEST_ENABLED", "true");
    const intent = detectTemplateIntent(said);
    expect(intent.kind === "explicit" || (intent.kind === "corrective_action" && intent.requestedCreation)).toBe(false);
  });
});
