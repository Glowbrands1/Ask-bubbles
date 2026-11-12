import { afterEach, beforeEach, vi } from "vitest";

/**
 * FORM_EDIT_SINGLE_WRITER_ENABLED ON: every test of `pm-draft-route.test.ts` again,
 * with the flag pinned on. That file runs with the flag as the environment
 * sets it (off in CI: today's behaviour, unchanged); its `instances.ts` mock
 * keeps what the writers saved and returns it from `loadInstance`
 * (`src/test/forms/saved-form-instances.ts`), so here each test asserts the
 * form as the one writer saved it (step 2b).
 */
beforeEach(() => {
  vi.stubEnv("FORM_EDIT_SINGLE_WRITER_ENABLED", "true");
});

await import("./pm-draft-route.test");

/*
 * Off-pin (Gate-Bubbles-2's POLICY_CITATION gate, 12 Nov 2026): these expectations are main's with POLICY_CITATION off
 * (it is off in production); with it on, the reply and the draft gain the quoted manual block. Held off here so a shell
 * or gate with the flag on cannot change what this file compares.
 */
beforeEach(() => {
  vi.stubEnv("POLICY_CITATION_ENABLED", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
