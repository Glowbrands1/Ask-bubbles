import { afterEach, describe, expect, it } from "vitest";

import { locationById } from "@/lib/locations";
import type { ChatFormProposal } from "@/types";

import { STORE_QUESTION, withStoreChoicesNamed } from "./store-choices-named";

/** STORE_CHOICES_NAMED_ENABLED (Problem 20, Bubbles production, 10 Nov 2026). The person and stores are invented. */
const FLAG = "STORE_CHOICES_NAMED_ENABLED";
const A = locationById("loc-67")!.name;
const B = locationById("loc-264")!.name;

function card(extra: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: "p",
    templateKey: "coaching",
    templateName: "Coaching Form",
    status: "needs_location",
    employeeName: "Wren Tallis",
    locationResolution: "needs_selection",
    authorizedLocationIds: ["loc-67", "loc-264"],
    employeeVerification: { status: "verified", title: "Team Member Part Time", storeIds: ["loc-67", "loc-264"] },
    ...extra,
  } as ChatFormProposal;
}

const reply = (formProposal: ChatFormProposal) => ({
  content: `Here is what I would put on a **Coaching Form**.\n\n${STORE_QUESTION}\n\n**Nothing has been created yet.**`,
  formProposal,
});

afterEach(() => {
  delete process.env[FLAG];
});

describe("STORE_CHOICES_NAMED", () => {
  it("flag off (as before): the bare question", () => {
    expect(withStoreChoicesNamed(reply(card())).content).toContain(STORE_QUESTION);
  });

  it("flag on: the person's two stores in Woven are named", () => {
    process.env[FLAG] = "true";
    const out = withStoreChoicesNamed(reply(card())).content;
    expect(out).toContain(`**Wren Tallis** works at **${A}** and **${B}** in Woven, and both are on your assignment, so I won't pick one. Which store is this about?`);
    expect(out).not.toContain(STORE_QUESTION);
  });

  it("flag on: no verified stores — the manager's stores are named", () => {
    process.env[FLAG] = "true";
    const out = withStoreChoicesNamed(reply(card({ employeeVerification: undefined }))).content;
    expect(out).toContain(`I won't choose which store this belongs to. Is it **${A}** or **${B}**?`);
  });

  it("flag on, NEVER-BREAK: a named out-of-scope store, or a resolved card, is left as it is", () => {
    process.env[FLAG] = "true";
    expect(withStoreChoicesNamed(reply(card({ namedLocationOutOfScope: "Elsewhere" }))).content).toContain(STORE_QUESTION);
    expect(withStoreChoicesNamed(reply(card({ locationResolution: "resolved" }))).content).toContain(STORE_QUESTION);
  });
});
