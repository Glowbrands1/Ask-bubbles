import { afterEach, describe, expect, it, vi } from "vitest";

import { readLocationMentions } from "@/lib/forms/location-mention";

/* October triage #6 (#186): the table's phrases. */
const PHRASES = [
  "she was late at dodge ne today",
  "she was late at dodge, ne today",
  "at dodge ne",
  "dodge ne location",
  "hi, one of my team members at our dodge, ne store gave her notice",
  "she works at Dodge, NE",
];

const ids = (text: string) => readLocationMentions(text).flatMap((mention) => mention.locationIds);

describe("STORE_ALIAS_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: the road with its state names no store, as before", () => {
    vi.stubEnv("STORE_ALIAS_ENABLED", "false");
    expect(ids("dodge ne location")).toEqual([]);
  });

  it.each(PHRASES)("on: %s names the West Dodge store", (text) => {
    vi.stubEnv("STORE_ALIAS_ENABLED", "true");
    expect(ids(text)).toEqual(["loc-264"]);
  });

  it("on: a road with no state still needs a place cue", () => {
    vi.stubEnv("STORE_ALIAS_ENABLED", "true");
    expect(ids("we talked about dodge today")).toEqual([]);
  });
});
