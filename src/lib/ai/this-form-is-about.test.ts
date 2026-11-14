import { afterEach, describe, expect, it, vi } from "vitest";

import { scopeRevision } from "@/lib/forms/revision";

import { asMadeAboutWording, madeAbout } from "./make-it-about";

/** QA's Bubbles 17n live test, 12 Nov 2026, item 3 — the manager's wording. THIS_FORM_IS_ABOUT_ENABLED. */
const SAID = "this form is about cash handling";

afterEach(() => vi.unstubAllEnvs());

describe("THIS_FORM_IS_ABOUT_ENABLED", () => {
  it("off: \"this form is about <X>\" is not a made-about (as before)", () => {
    // Changed on purpose (14 Nov 2026, QA round 17z-c): the off step pins the flag off, so the test holds once
    // THIS_FORM_IS_ABOUT_ENABLED is in production-flags.json (Gate-Bubbles-2's note on #848).
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "false");
    expect(madeAbout(SAID)).toBeNull();
  });

  it("on: reads <X> from \"this form is about <X>\" and its variants", () => {
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "true");
    expect(madeAbout(SAID)).toMatch(/^cash handling/);
    expect(madeAbout("the coaching form should be about being late")).toMatch(/^being late/);
    expect(madeAbout("This CA is about the register")).toMatch(/^the register/);
  });

  it("on: the revision reads it as \"make it about <X>\"", () => {
    // Changed on purpose (14 Nov 2026, QA round 17z-c): the off step pins the flag off, so the test holds once
    // THIS_FORM_IS_ABOUT_ENABLED is in production-flags.json (Gate-Bubbles-2's note on #848).
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "false");
    expect(asMadeAboutWording(SAID)).toBe(SAID);
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "true");
    expect(asMadeAboutWording(SAID)).toBe("make it about cash handling");
  });

  it("on: a sentence that says what something else is about is not one", () => {
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "true");
    expect(madeAbout("this policy is about cash handling")).toBeNull();
    expect(madeAbout("what is this form about?")).toBeNull();
  });

  it("on, with EDIT_MAKE_IT_ABOUT: the revision covers the account fields", () => {
    vi.stubEnv("EDIT_MAKE_IT_ABOUT_ENABLED", "true");
    // Changed on purpose (14 Nov 2026, QA round 17z-c): the off step pins the flag off, so the test holds once
    // THIS_FORM_IS_ABOUT_ENABLED is in production-flags.json (Gate-Bubbles-2's note on #848).
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "false");
    const fields = [{ key: "coaching_details", label: "Details" }] as unknown as Parameters<typeof scopeRevision>[1];
    const off = scopeRevision(SAID, fields);
    vi.stubEnv("THIS_FORM_IS_ABOUT_ENABLED", "true");
    const on = scopeRevision(SAID, fields);
    expect(on.mode).toBe("fields");
    expect(off.keys.has("coaching_details")).toBe(false);
    expect(on.keys.has("coaching_details")).toBe(true);
  });
});
