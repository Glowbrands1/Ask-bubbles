import { describe, expect, it } from "vitest";

import { APPROVED_GOOGLE_STORES, approvedStoreByCode } from "@/config/company/google-reviews";

import { isOtherBrandTitle, matchApprovedStores, normalizeAddressText } from "./matching";
import { contentHash, normalizeReview, normalizeReviews } from "./normalize";
import type { GoogleLocation } from "./types";

const ACCOUNT = "accounts/111";
const LOCATION = "locations/222";
const expected = { accountName: ACCOUNT, locationName: LOCATION };
const raw = (over: Record<string, unknown> = {}) => ({
  name: `${ACCOUNT}/${LOCATION}/reviews/AbC_123`,
  reviewId: "AbC_123",
  reviewer: { displayName: "Zzreviewer Person", profilePhotoUrl: "https://example.invalid/photo.jpg", isAnonymous: false },
  starRating: "FOUR",
  comment: "  Great soap!  ",
  createTime: "2026-10-01T12:00:00.123Z",
  updateTime: "2026-10-02T09:30:00Z",
  reviewReply: { comment: " Thank you ", updateTime: "2026-10-02T10:00:00Z" },
  ...over,
});

describe("normalizeReview", () => {
  it("keeps only the fields Ask Bubbles stores and DROPS the reviewer entirely", () => {
    const result = normalizeReview(raw(), expected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.review).sort()).toEqual(["comment", "contentHash", "createTime", "googleReviewId", "replyComment", "replyUpdateTime", "resourceName", "starRating", "updateTime"]);
    expect(result.review).toMatchObject({ googleReviewId: "AbC_123", starRating: 4, comment: "Great soap!", replyComment: "Thank you", createTime: "2026-10-01T12:00:00.123Z", updateTime: "2026-10-02T09:30:00.000Z", replyUpdateTime: "2026-10-02T10:00:00.000Z" });
    expect(JSON.stringify(result.review)).not.toMatch(/Zzreviewer|photo|example\.invalid|isAnonymous/);
  });

  it("maps all five ratings and refuses an unspecified or malformed one", () => {
    for (const [name, n] of [["ONE", 1], ["TWO", 2], ["THREE", 3], ["FOUR", 4], ["FIVE", 5]] as const) {
      expect(normalizeReview(raw({ starRating: name }), expected)).toMatchObject({ ok: true, review: { starRating: n } });
    }
    for (const bad of ["STAR_RATING_UNSPECIFIED", "SIX", "five", 5, null, undefined]) expect(normalizeReview(raw({ starRating: bad }), expected)).toEqual({ ok: false, reason: "bad_rating" });
  });

  it("REJECTS a review that is not under the location it was requested from (cross-store defence)", () => {
    expect(normalizeReview(raw({ name: "accounts/111/locations/999/reviews/AbC_123" }), expected)).toEqual({ ok: false, reason: "resource_mismatch" });
    expect(normalizeReview(raw({ name: "accounts/999/locations/222/reviews/AbC_123" }), expected)).toEqual({ ok: false, reason: "resource_mismatch" });
    expect(normalizeReview(raw({ name: `${ACCOUNT}/${LOCATION}/reviews/OTHER` }), expected)).toEqual({ ok: false, reason: "resource_mismatch" });
    expect(normalizeReview(raw({ name: undefined }), expected)).toEqual({ ok: false, reason: "resource_mismatch" });
  });

  it("rejects bad ids, non-objects and bad times; a missing updateTime falls back to createTime; text is capped", () => {
    for (const bad of ["", "a b", "x".repeat(201), "../x", 5, undefined]) expect(normalizeReview(raw({ reviewId: bad }), expected)).toEqual({ ok: false, reason: "bad_id" });
    for (const nope of [null, "x", 5, [], undefined]) expect(normalizeReview(nope, expected)).toEqual({ ok: false, reason: "not_an_object" });
    expect(normalizeReview(raw({ createTime: "yesterday" }), expected)).toEqual({ ok: false, reason: "bad_time" });
    expect(normalizeReview(raw({ createTime: undefined }), expected)).toEqual({ ok: false, reason: "bad_time" });
    const r = normalizeReview(raw({ updateTime: undefined, comment: "x".repeat(9000) }), expected);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) { expect(r.review.updateTime).toBe(r.review.createTime); expect(r.review.comment!.length).toBe(5000); }
  });

  it("treats a rating-only review (no text) and a missing or empty reply as null, never as empty strings", () => {
    const r = normalizeReview(raw({ comment: undefined, reviewReply: { comment: "   ", updateTime: "2026-10-02T10:00:00Z" } }), expected);
    expect(r).toMatchObject({ ok: true, review: { comment: null, replyComment: null, replyUpdateTime: null } });
    expect(normalizeReview(raw({ reviewReply: undefined }), expected)).toMatchObject({ ok: true, review: { replyComment: null } });
  });

  it("hashes exactly the fields that can change: a new reply or an edited rating changes the hash, reviewer noise does not", () => {
    const a = normalizeReview(raw(), expected);
    const sameWithNoise = normalizeReview(raw({ reviewer: { displayName: "Someone Else" } }), expected);
    const replied = normalizeReview(raw({ reviewReply: { comment: "Updated reply", updateTime: "2026-10-03T00:00:00Z" } }), expected);
    const edited = normalizeReview(raw({ starRating: "ONE", updateTime: "2026-10-03T00:00:00Z" }), expected);
    const hash = (r: ReturnType<typeof normalizeReview>) => (r.ok ? r.review.contentHash : "");
    expect(hash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hash(a)).toBe(hash(sameWithNoise));
    expect(hash(a)).not.toBe(hash(replied));
    expect(hash(a)).not.toBe(hash(edited));
    expect(contentHash({ starRating: 5, comment: null, updateTime: "t", replyComment: null, replyUpdateTime: null })).toHaveLength(64);
  });
});

describe("normalizeReviews", () => {
  it("de-duplicates within a read, counts rejections by reason, and reports the batch honestly", () => {
    const batch = normalizeReviews([raw(), raw(), raw({ reviewId: "R2", name: `${ACCOUNT}/${LOCATION}/reviews/R2` }), raw({ starRating: "SIX" }), "junk", raw({ name: "accounts/1/locations/9/reviews/AbC_123" })], expected);
    expect(batch.reviews.map((r) => r.googleReviewId)).toEqual(["AbC_123", "R2"]);
    expect(batch.duplicatesInRead).toBe(1);
    expect(batch.rejected).toMatchObject({ bad_rating: 1, not_an_object: 1, resource_mismatch: 1 });
    expect(batch.rejectedTotal).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------
// matching
// ---------------------------------------------------------------------------------------------

let n = 0;
const g = (title: string, storeCode: string | null, lines: string[], city: string | null, state: string | null, zip: string | null, account = "accounts/10"): GoogleLocation => {
  n += 1;
  return { accountName: account, locationName: `locations/${1000 + n}`, title, storeCode, address: city === null && lines.length === 0 ? null : { lines, locality: city, administrativeArea: state, postalCode: zip } };
};

/** Seven Buff City Soap profiles, set up exactly as Google would list them. */
function buffProfiles(over: Partial<Record<string, GoogleLocation>> = {}): GoogleLocation[] {
  const make = (code: string) => {
    const s = approvedStoreByCode(code)!;
    return g(`Buff City Soap - ${s.city}`, s.code, [s.addressLine2 ? `${s.addressLine1}, ${s.addressLine2}` : s.addressLine1], s.city, s.state, s.postalCode);
  };
  return APPROVED_GOOGLE_STORES.map((s) => over[s.code] ?? make(s.code));
}

/** Fifteen Sun Tan City decoys, including one that borrows an approved store code. */
function sunTanCityDecoys(): GoogleLocation[] {
  const codes = ["140", "141", "143", "144", "145", "146", "147", "148", "231", "254", "306", "307", "314", "373", "409"];
  return codes.map((c, i) => g(`Sun Tan City - Test ${c}`, c, [`${100 + i} Synthetic Way`], "Testville", "KS", `66${String(100 + i)}`, "accounts/10"));
}

describe("matchApprovedStores", () => {
  it("matches all seven approved stores by exact store code AND address, and ignores every Sun Tan City profile", () => {
    const report = matchApprovedStores([...buffProfiles(), ...sunTanCityDecoys()]);
    expect(report.stores.map((s) => [s.store.code, s.status, s.confidence])).toEqual(APPROVED_GOOGLE_STORES.map((s) => [s.code, "matched", "high"]));
    expect(new Set(report.stores.map((s) => s.locationName)).size).toBe(7);
    expect(report.googleLocationsSeen).toBe(22);
    expect(report.blockedOtherBrand).toBe(15); // Sun Tan City: dropped before any comparison
    expect(report.ignoredNotApproved).toBe(0);
  });

  it("counts an unrelated business in the account as ignored (not blocked, not stored)", () => {
    const stranger = g("Joe's Hardware", "77", ["9 Main St"], "Elsewhere", "OH", "44444");
    const report = matchApprovedStores([...buffProfiles(), stranger]);
    expect(report.ignoredNotApproved).toBe(1);
    expect(report.blockedOtherBrand).toBe(0);
    expect(report.stores.every((s) => s.status === "matched")).toBe(true);
  });

  it("is order-independent and does not mutate its input", () => {
    const all = [...buffProfiles(), ...sunTanCityDecoys()];
    const snapshot = JSON.stringify(all);
    const forward = matchApprovedStores(all);
    const backward = matchApprovedStores([...all].reverse());
    expect(JSON.stringify(all)).toBe(snapshot);
    expect(backward.stores.map((s) => [s.store.code, s.status, s.locationName])).toEqual(forward.stores.map((s) => [s.store.code, s.status, s.locationName]));
  });

  it("tells the two Sioux Falls stores apart by code AND street, never by city", () => {
    const report = matchApprovedStores(buffProfiles());
    const a = report.stores.find((s) => s.store.code === "225")!;
    const b = report.stores.find((s) => s.store.code === "338")!;
    expect(a.locationName).not.toBe(b.locationName);
    // swap the two profiles' addresses: each code now disagrees with its address → both are mismatches, neither links
    const [p225, p338] = [buffProfiles().find((x) => x.storeCode === "225")!, buffProfiles().find((x) => x.storeCode === "338")!];
    const swapped = matchApprovedStores(buffProfiles({ "225": { ...p225, address: p338.address }, "338": { ...p338, address: p225.address } }));
    expect(swapped.stores.find((s) => s.store.code === "225")).toMatchObject({ status: "mismatch", locationName: null });
    expect(swapped.stores.find((s) => s.store.code === "338")).toMatchObject({ status: "mismatch", locationName: null });
  });

  it("BLOCKS another brand's profile even when its store code and address match an approved store", () => {
    const real = approvedStoreByCode("219")!;
    const impostor = g("Sun Tan City - Lee's Summit", "219", [`${real.addressLine1}, ${real.addressLine2}`], real.city, real.state, real.postalCode);
    const report = matchApprovedStores([impostor]);
    expect(report.blockedOtherBrand).toBe(1);
    expect(report.stores.find((s) => s.store.code === "219")).toMatchObject({ status: "unmatched", locationName: null });
    expect(isOtherBrandTitle("SUNTAN CITY #4")).toBe(true);
    expect(isOtherBrandTitle("Sun-Tan City")).toBe(true);
    expect(isOtherBrandTitle("Buff City Soap")).toBe(false);
    expect(isOtherBrandTitle(null)).toBe(false);
  });

  it("a code match with a DIFFERENT address is a mismatch, not a link", () => {
    const p = buffProfiles({ "264": g("Buff City Soap - Omaha", "264", ["1 Wrong Street"], "Omaha", "NE", "68114") });
    expect(matchApprovedStores(p).stores.find((s) => s.store.code === "264")).toMatchObject({ status: "mismatch", locationName: null, evidence: { reason: "store_code_matches_but_address_differs" } });
  });

  it("the right address with NO store code set is only a CANDIDATE for an administrator to confirm — and carries what they need to decide", () => {
    const s66 = approvedStoreByCode("66")!;
    const p = buffProfiles({ "66": g("Buff City Soap - Kearney", null, [s66.addressLine1], s66.city, s66.state, s66.postalCode) });
    const m = matchApprovedStores(p).stores.find((s) => s.store.code === "66")!;
    expect(m).toMatchObject({ status: "candidate", confidence: "medium", accountName: null, locationName: null });
    expect(m.evidence.candidate).toMatchObject({ title: "Buff City Soap - Kearney", city: "Kearney", state: "NE" });
  });

  it("the right address but a DIFFERENT store code is a mismatch (never linked)", () => {
    const s67 = approvedStoreByCode("67")!;
    const p = buffProfiles({ "67": g("Buff City Soap - Bellevue", "999", [s67.addressLine1], s67.city, s67.state, s67.postalCode) });
    expect(matchApprovedStores(p).stores.find((s) => s.store.code === "67")).toMatchObject({ status: "mismatch", evidence: { reason: "address_matches_but_store_code_differs" } });
  });

  it("the right store code with NO address is a candidate; two identical full matches are AMBIGUOUS and link nothing", () => {
    const withoutAddress = buffProfiles({ "236": g("Buff City Soap - Grand Island", "236", [], null, null, null) });
    expect(matchApprovedStores(withoutAddress).stores.find((s) => s.store.code === "236")).toMatchObject({ status: "candidate" });
    const dup = [...buffProfiles(), buffProfiles().find((x) => x.storeCode === "219")!].map((x, i) => (i === 7 ? { ...x, locationName: "locations/9999" } : x));
    expect(matchApprovedStores(dup).stores.find((s) => s.store.code === "219")).toMatchObject({ status: "ambiguous", locationName: null });
  });

  it("an empty account, and an account holding only other brands, match nothing", () => {
    expect(matchApprovedStores([]).stores.every((s) => s.status === "unmatched")).toBe(true);
    const r = matchApprovedStores(sunTanCityDecoys());
    expect(r.stores.every((s) => s.status === "unmatched")).toBe(true);
    expect(r.blockedOtherBrand).toBe(15);
  });

  it("copes with address spelling: Road/Rd, West/W, suites, case and punctuation — but not a different number", () => {
    expect(normalizeAddressText("7810 West Dodge Road, Suite 100")).toBe("7810 w dodge rd ste 100");
    const s = approvedStoreByCode("264")!;
    const spelled = g("Buff City Soap", "264", ["7810 W. Dodge Road"], "OMAHA", "ne", "68114-1234");
    expect(matchApprovedStores([spelled]).stores.find((x) => x.store.code === "264")).toMatchObject({ status: "matched" });
    const wrongNumber = g("Buff City Soap", "264", ["7811 West Dodge Rd"], s.city, s.state, s.postalCode);
    expect(matchApprovedStores([wrongNumber]).stores.find((x) => x.store.code === "264")).toMatchObject({ status: "mismatch" });
  });

  it("never derives a link from a number in another system: a Woven-style or Sun Tan City code on the right address links nothing", () => {
    const s = approvedStoreByCode("225")!;
    // The comparison is EXACT (the API client trims whitespace before it gets here): padding, a leading zero, a Sun Tan City
    // number or a Woven-style id on the right address is a conflicting code, so the store is not linked.
    for (const foreign of ["0225", "0462", "306", "WOVEN-225", "225 ", " 225"]) {
      const loc = g("Buff City Soap", foreign, [s.addressLine1], s.city, s.state, s.postalCode);
      const m = matchApprovedStores([loc]).stores.find((x) => x.store.code === "225")!;
      expect(m.status, foreign).toBe("mismatch");
      expect(m.locationName).toBeNull();
    }
  });

  it("a Google location can be linked to only one store (no double link)", () => {
    const s219 = approvedStoreByCode("219")!;
    const one = g("Buff City Soap", "219", [`${s219.addressLine1}, ${s219.addressLine2}`], s219.city, s219.state, s219.postalCode);
    const linked = matchApprovedStores([one, ...buffProfiles().filter((x) => x.storeCode !== "219")]).stores.filter((s) => s.status === "matched");
    expect(new Set(linked.map((s) => s.locationName)).size).toBe(linked.length);
  });
});
