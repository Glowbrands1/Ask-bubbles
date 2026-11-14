import { afterEach, describe, expect, it, vi } from "vitest";

import { ROSTER_STORE_INDEX } from "@/lib/forms/location-mention";

import { readStoreMentions } from "./resolver";

/* REASON_PLACE_NOT_STORE (Gate-Bubbles-3's #869 probes, 13 Nov 2026). Invented wording. */
afterEach(() => vi.unstubAllEnvs());

const ids = (text: string) => readStoreMentions(text, ROSTER_STORE_INDEX).mentions.flatMap((mention) => mention.locationIds);

describe("REASON_PLACE_NOT_STORE", () => {
  it("off: the reason's place is read as a store (as on main)", () => {
    vi.stubEnv("REASON_PLACE_NOT_STORE_ENABLED", "");
    expect(ids("she was late because she was at sioux falls west")).toEqual(["loc-225"]);
  });

  it("on: a place in a because-clause is not a store", () => {
    vi.stubEnv("REASON_PLACE_NOT_STORE_ENABLED", "true");
    expect(ids("she was late because she was at sioux falls west")).toEqual([]);
    expect(ids("she was late on 11/1/26 because tessaly was in sioux falls west, then she left")).toEqual([]);
    // Gate-Bubbles-3's #879 probes: the same reason, said another way.
    for (const why of ["bc", "b/c", "cause", "'cause", "cuz", "since"]) {
      expect(ids(`she was late ${why} she was at sioux falls west`), why).toEqual([]);
    }
  });

  it("on: \"since\" as a time word leaves the store to be read (QA, 14 Nov 2026)", () => {
    vi.stubEnv("REASON_PLACE_NOT_STORE_ENABLED", "true");
    expect(ids("since 11/3 she has been late at kearney")).toEqual(["loc-66"]);
    expect(ids("she's been late at kearney since monday")).toEqual(["loc-66"]);
    expect(ids("ever since she transferred to kearney she has been late at kearney")).toEqual(["loc-66"]);
  });

  it("on: a store said as the store is still read, also beside a reason", () => {
    vi.stubEnv("REASON_PLACE_NOT_STORE_ENABLED", "true");
    expect(ids("she was late at kearney")).toEqual(["loc-66"]);
    expect(ids("at kearney, she was late because she was at sioux falls west")).toEqual(["loc-66"]);
    expect(ids("she was late because she was at sioux falls west and then at kearney today")).toEqual(["loc-66"]);
  });
});
