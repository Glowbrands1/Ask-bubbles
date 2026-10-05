// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { QUICK_QUESTIONS, quickQuestionsFor } from "@/lib/ai/quick-questions";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { AccessScope, Permission, Role } from "@/types";

import { AskBand } from "./ask-band";

/**
 * ============================================================================
 * THE CHIPS ON THE BAND ARE THE READER'S, NOT A CONSTANT
 * ============================================================================
 *
 * `quick-questions.test.ts` proves the resolution. This proves the WIRING —
 * that the band asks for this reader's questions and renders what comes back.
 * The two could not both be broken silently, but either could: the band sliced
 * a module constant for its whole life, and a component that kept doing that
 * would pass every test in the other file.
 *
 * THE FOUR-CHIP CAP IS PART OF THE WIRING. The band draws four, the catalogue
 * can hold more for a given reader, and which four depends on who is asking —
 * so the cap is asserted here beside the selection rather than trusted.
 */

/* The identity under test, rebound per case before each render. */
let session = {
  role: "location_manager" as Role,
  scope: {
    level: "location",
    primaryAreaId: "loc-101",
    alsoCoversAreaIds: [],
  } as AccessScope,
};

const can = (permission: Permission) =>
  hasPermission(DEFAULT_PERMISSION_MATRIX, session.role, permission);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({
    user: {
      name: "Test Manager",
      isLocationAccount: false,
      title: "Location Manager",
      scope: session.scope,
    },
    role: session.role,
    /*
     * THE REAL MATRIX, not `() => true`. Whether an employee is offered a
     * forms chip is the whole question in one case below, and a permissive
     * stub would answer it wrong in the direction that passes.
     */
    can,
    primaryLocationName: "Testville Downtown",
    managerDisplayName: "Test",
    demoMode: true,
    brand: { knowledgeScopeId: "company-core" },
  }),
}));

vi.mock("@/lib/store/app-store", () => ({
  useAppStore: () => ({
    forms: [],
    documents: [{ id: "doc-1" }],
    conversations: [],
    addConversation() {},
    appendConversationMessages() {},
    updateConversation() {},
    patchConversationMessage() {},
    removeConversation() {},
    clearConversations() {},
  }),
}));

function chips(): string[] {
  return screen
    .getAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "")
    .filter((text) => text.endsWith("?") || text.endsWith("."));
}

beforeEach(() => {
  session = {
    role: "location_manager",
    scope: { level: "location", primaryAreaId: "loc-101", alsoCoversAreaIds: [] },
  };
});

afterEach(cleanup);

describe("the Home band offers the questions this reader can be answered", () => {
  it.each([
    ["employee", "location", "loc-101"],
    ["assistant_manager", "location", "loc-101"],
    ["location_manager", "location", "loc-101"],
    ["district_manager", "district", "dist-east"],
    ["regional_manager", "region", "reg-south"],
    ["admin", "global", null],
  ] as const)("renders exactly the resolved questions for %s, capped at four", (role, level, area) => {
    session = { role, scope: { level, primaryAreaId: area, alsoCoversAreaIds: [] } };
    render(<AskBand />);

    const expected = quickQuestionsFor({ scope: session.scope, can }).slice(0, 4);
    expect(expected.length).toBeGreaterThan(0);
    expect(chips()).toEqual(expected);
  });

  it("gives a manager four chips from the catalogue, in catalogue order", () => {
    render(<AskBand />);

    const rendered = chips();
    expect(rendered).toHaveLength(4);
    const order = rendered.map((chip) => QUICK_QUESTIONS.findIndex((q) => q.text === chip));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  /**
   * EXTRA LOCATION ACCESS IS A DATA BOUNDARY, NOT A PROMOTION. A location
   * manager covering more locations during a vacancy is still a location
   * manager, and the band must not change what it offers them.
   */
  it("keeps a location manager on the same chips when they cover extra locations", () => {
    render(<AskBand />);
    const single = chips();
    cleanup();

    session = {
      role: "location_manager",
      scope: {
        level: "location",
        primaryAreaId: "loc-101",
        alsoCoversAreaIds: ["loc-102", "loc-201"],
      },
    };
    render(<AskBand />);
    expect(chips()).toEqual(single);
    expect(chips().join(" ")).not.toMatch(/my district|my region/i);
  });

  it("offers an employee only knowledge questions, and does not leave them with none", () => {
    session = {
      role: "employee",
      scope: { level: "location", primaryAreaId: "loc-101", alsoCoversAreaIds: [] },
    };
    render(<AskBand />);

    const rendered = chips();
    expect(rendered.length).toBeGreaterThan(0);
    const offered = QUICK_QUESTIONS.filter((question) => rendered.includes(question.text));
    expect(offered.every((question) => question.needs === null || question.needs === "view_knowledge")).toBe(
      true,
    );
    expect(rendered).not.toContain("Which forms can I create here?");
  });

  it("promises no report figure, because no report is connected", () => {
    session = {
      role: "admin",
      scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
    };
    render(<AskBand />);
    expect(chips().join(" ")).not.toMatch(/revenue|sales|latest data|figures/i);
  });
});
