import { describe, expect, it } from "vitest";

import { APPROVED_GOOGLE_STORES, approvedStoreByCode, googleStoreNumber } from "@/config/company/google-reviews";
import { storeCodesNamedIn } from "@/lib/ai/google-reviews-chat";
import { COMPANY_LOCATIONS, locationByCode } from "@/lib/locations";
import { describeStore } from "@/lib/stores/resolver";

/*
 * District Manager email to Pau, 3 Nov 2026 (relayed by QA, 5 Nov): on Ask
 * Bubbles' Google Reviews "the two South Dakota stores have the same name, and
 * the Dawley store has the wrong store number". The company's list:
 * 0066 NE Kearney · 0067 NE Bellevue · 0219 MO Lee's Summit · 0225 SD Sioux Falls
 * · 0236 NE Grand Island · 0264 NE Omaha Dodge · 0309 SD Dawley Farms.
 *
 * 338 is the store code on Google's own Business Profile for 5902 E 18th St
 * (the sync matched it: store_code_equal, with the street address), and loc-338
 * is this app's location id. Both stay. The company number is shown separately.
 */
const COMPANY_LIST: Record<string, string> = {
  "66": "66",
  "67": "67",
  "219": "219",
  "225": "225",
  "236": "236",
  "264": "264",
  "338": "309",
};

describe("DM report, 3 Nov 2026: the Dawley Farms store's number and name", () => {
  it("every store shows the company's number; only Dawley Farms differs from its Google code", () => {
    for (const store of APPROVED_GOOGLE_STORES) expect(googleStoreNumber(store.code), store.code).toBe(COMPANY_LIST[store.code]);
  });

  it("the Google match key is unchanged: code 338 is the E 18th St profile", () => {
    expect(approvedStoreByCode("338")?.addressLine1).toBe("5902 E 18th St");
    expect(approvedStoreByCode("309")).toBeUndefined();
  });

  it("the two South Dakota stores have different names in the app; the E 18th St store is numbered 309", () => {
    const sd = COMPANY_LOCATIONS.filter((store) => store.state === "SD");
    expect(new Set(sd.map((store) => store.name)).size).toBe(sd.length);
    expect(locationByCode("338")?.id).toBe("loc-338");
    expect(describeStore(locationByCode("338")!)).toBe("Sioux Falls, SD (E 18th St) (Store 309)");
    expect(describeStore(locationByCode("225")!)).toBe("Sioux Falls, SD (W 41st St) (Store 225)");
  });

  it("chat: a Google reviews question for store 309 or Dawley Farms names the E 18th St store; store 338 still does", () => {
    expect(storeCodesNamedIn("how many google reviews does store 309 have this month?")).toEqual(["338"]);
    expect(storeCodesNamedIn("google reviews for store #0309")).toEqual(["338"]);
    expect(storeCodesNamedIn("google reviews at Dawley Farms this month")).toEqual(["338"]);
    expect(storeCodesNamedIn("google reviews for store 338")).toEqual(["338"]);
  });
});
