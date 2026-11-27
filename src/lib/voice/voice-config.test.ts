import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { voiceInputEnabledFor } from "./voice-config";

const KEYS = ["VOICE_INPUT_ENABLED", "VOICE_INPUT_USERS", "ASSEMBLYAI_API_KEY", "NEXT_PUBLIC_DEMO_MODE"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.VOICE_INPUT_ENABLED = "true";
  process.env.VOICE_INPUT_USERS = "ada@example.test,bea@example.test";
  process.env.ASSEMBLYAI_API_KEY = "test-key-not-real";
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllEnvs();
});

describe("voiceInputEnabledFor", () => {
  it("on for a listed email", () => {
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(true);
  });

  it("off when the flag is off or unset", () => {
    process.env.VOICE_INPUT_ENABLED = "false";
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
    delete process.env.VOICE_INPUT_ENABLED;
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
  });

  it("off in demo mode", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
  });

  it("off without the provider key", () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
    process.env.ASSEMBLYAI_API_KEY = "   ";
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
  });

  it("nobody when VOICE_INPUT_USERS is unset or empty", () => {
    delete process.env.VOICE_INPUT_USERS;
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
    process.env.VOICE_INPUT_USERS = "";
    expect(voiceInputEnabledFor({ email: "ada@example.test" })).toBe(false);
  });

  it("off for an email not listed, or no email", () => {
    expect(voiceInputEnabledFor({ email: "cy@example.test" })).toBe(false);
    expect(voiceInputEnabledFor({ email: "" })).toBe(false);
    expect(voiceInputEnabledFor({ email: null })).toBe(false);
  });

  it("matches ignoring letter case", () => {
    expect(voiceInputEnabledFor({ email: "ADA@Example.TEST" })).toBe(true);
    process.env.VOICE_INPUT_USERS = "Bea@EXAMPLE.test";
    expect(voiceInputEnabledFor({ email: "bea@example.test" })).toBe(true);
  });

  it("trims spaces around entries", () => {
    process.env.VOICE_INPUT_USERS = "  ada@example.test ,   bea@example.test  ";
    expect(voiceInputEnabledFor({ email: "bea@example.test" })).toBe(true);
    expect(voiceInputEnabledFor({ email: " ada@example.test " })).toBe(true);
  });

  /* The owner, 27 Nov 2026: "can you roll out the mic to all pls, all users + all apps". */
  it('"*" on VOICE_INPUT_USERS: everyone signed in, still only with the flag, the key and an email', () => {
    process.env.VOICE_INPUT_USERS = " * ";
    expect(voiceInputEnabledFor({ email: "anyone@example.test" })).toBe(true);
    expect(voiceInputEnabledFor({ email: "" })).toBe(false);
    expect(voiceInputEnabledFor({ email: undefined })).toBe(false);
    process.env.VOICE_INPUT_ENABLED = "false";
    expect(voiceInputEnabledFor({ email: "anyone@example.test" })).toBe(false);
  });
});
