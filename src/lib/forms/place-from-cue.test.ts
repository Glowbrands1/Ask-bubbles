import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

import { proposeLocation } from "./location-scope";

/*
 * The sibling app's gate, 6 Nov 2026 (sf-s28), checked here: "… for <name> from bellevue" from a
 * location manager whose only store is West Dodge filed the card at West Dodge with no word about
 * Bellevue ("from" is no place cue). PLACE_FROM_CUE_ENABLED: "a CA for <name> from <store>" names
 * the store. Every person is invented.
 */
const WEST_DODGE: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };
const at = (text: string) => proposeLocation(WEST_DODGE, text, ["loc-264"]);
const BELLEVUE = "create a corrective action for Marisol Quenby from bellevue, she was rude to a guest at the register";

afterEach(() => vi.unstubAllEnvs());
const on = () => vi.stubEnv("PLACE_FROM_CUE_ENABLED", "true");

describe("PLACE_FROM_CUE_ENABLED: \"a CA for <name> from <store>\" names the store", () => {
  it("off: Bellevue is not read, so the card takes West Dodge", () => {
    expect(at(BELLEVUE)).toMatchObject({ resolution: "resolved", locationId: "loc-264" });
  });

  it("on: the store off the assignment is a question, Bellevue named", () => {
    on();
    expect(at(BELLEVUE)).toMatchObject({ resolution: "needs_selection", authorizedIds: ["loc-264"], outOfScopeName: "Bellevue, NE" });
  });

  it("on: the manager's own store named that way resolves to it", () => {
    on();
    expect(at("i need a ca for Marisol Quenby from west dodge, she was late opening")).toMatchObject({ resolution: "resolved", locationId: "loc-264" });
  });

  it.each([
    "create a corrective action for Marisol Quenby, she transferred from bellevue last month, she was late opening",
    "create a corrective action for Marisol Quenby, she got a call from the store and left early",
    "create a corrective action for Marisol Quenby, late every day from 10/5",
    "create a corrective action for Marisol Quenby, a complaint from a guest about her attitude",
    "create a corrective action for Marisol Quenby, she ignored a direction from the district manager",
  ])("on, negative: %s keeps the employee's store (no out-of-scope question)", (text) => {
    on();
    expect(at(text)).toMatchObject({ resolution: "resolved", locationId: "loc-264" });
  });
});
