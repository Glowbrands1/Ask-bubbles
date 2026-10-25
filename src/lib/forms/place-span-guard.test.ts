import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES, placeSpanGuardEnabled } from "@/lib/config/chat-quality-flags";
import type { AccessScope } from "@/types";

import { readLocation, readLocationMentions } from "./location-mention";
import { proposeLocation } from "./location-scope";

/**
 * ============================================================================
 * "CITE ANIMALS IN THE WORKPLACE POLICY" IS NOT A STORE
 * ============================================================================
 *
 * conv_mvmcetjw2i4vtwz, 24 Oct 2026. The manager asked for a policy, then
 * named the store. The form context joined the two turns, the span reader read
 * "in the workplace policy store", and the card asked about a typed store:
 * `locationSelection: { typed: "workplace policy", reason: "not_found" }`.
 *
 * The shipped roster, not a fixture: this is the reader production ran.
 */

// The manager's own turns, as the form context held them (sourceMessageIds).
const TURNS = ["cite animals in the workplace policy", "store location is empire, sd. create corrective action"];
// `bounded-context` joins retained turns with a blank line.
const TEXT = TURNS.join("\n\n");

// The manager's seven stores (authorizedLocationIds on the stored proposal).
const SCOPE: AccessScope = {
  level: "location",
  primaryAreaId: "loc-66",
  alsoCoversAreaIds: ["loc-67", "loc-219", "loc-225", "loc-236", "loc-264", "loc-338"],
};

const typedStore = () => {
  const proposal = proposeLocation(SCOPE, TEXT, [], undefined, { turns: TURNS });
  return proposal.resolution === "needs_selection" ? (proposal.selection?.typed ?? null) : null;
};

// TYPED_NAME_ENABLED also drops a span made of the manual's title words. It
// is kept off here so the guard is proved on its own, as production ran it.
const saved = process.env.TYPED_NAME_ENABLED;
beforeEach(() => {
  delete process.env.PLACE_SPAN_GUARD_ENABLED;
  delete process.env.TYPED_NAME_ENABLED;
});
afterEach(() => {
  delete process.env.PLACE_SPAN_GUARD_ENABLED;
  if (saved === undefined) delete process.env.TYPED_NAME_ENABLED;
  else process.env.TYPED_NAME_ENABLED = saved;
});

describe("PLACE_SPAN_GUARD_ENABLED", () => {
  it("defaults off and is a registered chat-quality flag", () => {
    delete process.env.PLACE_SPAN_GUARD_ENABLED;
    expect(placeSpanGuardEnabled()).toBe(false);
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("PLACE_SPAN_GUARD_ENABLED");
    process.env.PLACE_SPAN_GUARD_ENABLED = "1";
    expect(placeSpanGuardEnabled()).toBe(true);
  });

  it("off: the reported behaviour is unchanged (the policy phrase is read as a typed store)", () => {
    expect(readLocation(TEXT).unmatched).toEqual(["workplace policy"]);
    expect(typedStore()).toBe("workplace policy");
  });
});

describe("conv_mvmcetjw2i4vtwz: a policy phrase is not a typed store (flag on)", () => {
  it("does not read 'workplace policy' from the joined turns", () => {
    process.env.PLACE_SPAN_GUARD_ENABLED = "1";
    expect(readLocation(TEXT).unmatched).not.toContain("workplace policy");
    expect(typedStore()).not.toBe("workplace policy");
  });

  it("does not read it when both are in one message either", () => {
    process.env.PLACE_SPAN_GUARD_ENABLED = "1";
    const text = "cite animals in the workplace policy. store location is empire, sd. create corrective action";
    expect(readLocation(text).unmatched.join(" ")).not.toMatch(/policy/i);
  });

  it("still reports a store-shaped name that is not registered", () => {
    process.env.PLACE_SPAN_GUARD_ENABLED = "1";
    expect(readLocation("coaching for Sarah at the Springfield store").unmatched).toEqual(["Springfield"]);
  });

  it("still reads a registered store named in the same conversation", () => {
    process.env.PLACE_SPAN_GUARD_ENABLED = "1";
    const turns = ["cite animals in the workplace policy", "she works at Kearney store"];
    expect(readLocation(turns.join("\n\n")).mentions.map((mention) => mention.locationIds)).toEqual([["loc-66"]]);
  });

  /*
   * The conversation's own second turn with a registered store in it: "<location>
   * is <place>". The card files the store named, the remap reads the same one,
   * and nothing is left over as a typed store.
   */
  it("'store location is Kearney, NE' after the policy turn is Kearney, with no typed store", () => {
    process.env.PLACE_SPAN_GUARD_ENABLED = "1";
    const turns = ["cite animals in the workplace policy", "store location is Kearney, NE. create corrective action"];
    const text = turns.join("\n\n");
    expect(readLocation(text).unmatched).toEqual([]);
    const proposal = proposeLocation(SCOPE, text, [], undefined, { turns });
    expect(proposal.resolution).toBe("resolved");
    expect(proposal.resolution === "resolved" ? proposal.locationId : null).toBe("loc-66");
    // form-full-remap reads one-store mentions from the manager's turn.
    const remap = readLocationMentions(turns[1]!).filter((mention) => !mention.confirm && mention.locationIds.length === 1);
    expect(remap.map((mention) => mention.locationIds)).toEqual([["loc-66"]]);
  });
});

it("every chat-quality flag name is unique", () => {
  expect(new Set(CHAT_QUALITY_FLAG_NAMES).size).toBe(CHAT_QUALITY_FLAG_NAMES.length);
});
