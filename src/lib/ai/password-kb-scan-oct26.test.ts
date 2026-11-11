import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redactSensitiveDefaults } from "./sensitive-defaults";

/**
 * ============================================================================
 * EVERY SIGN-IN SENTENCE IN THE KNOWLEDGE BASE, THROUGH THE REDACTOR
 * (SENSITIVE_DEFAULTS_REDACT_ENABLED)
 * ============================================================================
 *
 * Coordinator, 26 Oct 2026: run the sentences a read-only scan of this app's
 * knowledge base found (a default, temporary, starting or initial password or
 * log-in, or a Social Security mention) through the final redactor; none may
 * leave a digit string after "password", "default" or "temporary". This app's
 * scan found one: the manual's own forbid, kept. The rest are the general
 * shapes, with invented values.
 */
const SCAN_KEPT = ["▪ Do not use default passwords, i.e., password###."];
const SHAPES = [
  "The default password is Ex4mpl7!",
  "• System A: the default password is *Example7 • System B: set the default password to the same one, the default password is Ex4mpl7!",
  "New hires start with the temporary password Temp777.",
  "The starting password is the store number plus 7777.",
  "Use the employee's social security number, and the some digits of it.",
  "Do not use default passwords, i.e., password777.",
];

const VALUE_AFTER_WORD = /\b(?:pass\s?words?|default|temporary)\b[^.\n]{0,40}?\d/i;

beforeEach(() => vi.stubEnv("SENSITIVE_DEFAULTS_REDACT_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("flag on", () => {
  it.each(SCAN_KEPT)("the scan's sentence is kept: %s", (text) => {
    expect(redactSensitiveDefaults(text)).toBe(text);
  });

  it.each(SHAPES.flatMap((text) => [text, text.toLowerCase()]))("no value survives: %s", (text) => {
    expect(redactSensitiveDefaults(text)).not.toMatch(VALUE_AFTER_WORD);
  });
});

describe("flag off: as retrieved (main)", () => {
  it("the text is returned as given", () => {
    vi.stubEnv("SENSITIVE_DEFAULTS_REDACT_ENABLED", "");
    const page = SHAPES.join("\n");
    expect(redactSensitiveDefaults(page)).toBe(page);
  });
});
