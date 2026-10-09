// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  DEFAULT_PERMISSION_MATRIX,
  canAccessAdminConsole,
  hasPermission,
} from "@/lib/permissions";
import type { Permission, Role } from "@/types";

import { SidebarNav } from "./sidebar";

/**
 * WHAT THE RAIL OFFERS EACH ROLE.
 *
 * Ask Bubbles' role matrix is company configuration, so these tests pin that
 * the rail follows it in demo and live alike: every screen a role may open has
 * a link, no screen it may not open does, and the admin console stays with the
 * administrative roles.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/forms/monitoring",
}));

// The rail also renders the profile menu, which reaches into the app store.
// That is not what is under test here, and mounting the whole store to check
// which links exist would make the test about the store instead.
vi.mock("./user-menu", () => ({
  UserMenu: () => null,
}));

/** The session values the rail actually reads. */
function session(role: Role, demoMode: boolean) {
  return {
    can: (permission: Permission) => hasPermission(DEFAULT_PERMISSION_MATRIX, role, permission),
    isAdmin: canAccessAdminConsole(role),
    role,
    demoMode,
  };
}

const mocked = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => mocked.value,
}));

beforeAll(() => {
  // Radix Tooltip measures, and jsdom has no layout.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

afterEach(cleanup);

function renderAs(role: Role, demoMode = true) {
  mocked.value = session(role, demoMode);
  return render(<SidebarNav />);
}

describe("what a Location Manager can reach from the rail in the demo", () => {
  /*
   * THE DEMO PREVIEWS THE CONFIGURED MATRIX. The role switcher exists to show
   * what each role will see, so the rail filters on `can()` in demo exactly as
   * it does live: no item the role cannot open, every item it can.
   */
  it("withholds Form Templates, which the matrix withholds", () => {
    expect(
      hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager", "manage_form_templates"),
    ).toBe(false);
    renderAs("location_manager");
    expect(screen.queryByRole("link", { name: /Form Templates/ })).toBeNull();
  });

  it("shows the Forms Register, which the matrix grants", () => {
    expect(
      hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager", "view_form_monitoring"),
    ).toBe(true);
    renderAs("location_manager");
    expect(screen.getByRole("link", { name: /Forms Register/ })).toBeTruthy();
  });

  it("keeps the admin console out of the rail", () => {
    renderAs("location_manager");
    expect(screen.queryByRole("link", { name: /User Management/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /AI Usage/ })).toBeNull();
  });

  it("gives a Team Member only the assistant and History", () => {
    renderAs("employee");
    expect(screen.getByRole("link", { name: /^Ask Bubbles$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^History$/ })).toBeTruthy();
    for (const label of [/^Home$/, /Forms Register/, /Form Templates/, /^Reports$/]) {
      expect(screen.queryByRole("link", { name: label }), String(label)).toBeNull();
    }
    // And the brand mark takes them to the assistant, not to a Home they cannot open.
    expect(screen.getByRole("link", { name: /— start$/ }).getAttribute("href")).toBe("/chat");
  });
});

describe("what an owner sees", () => {
  it("gets the admin console as well", () => {
    renderAs("owner");
    expect(screen.getByRole("link", { name: /Form Templates/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /User Management/ })).toBeTruthy();
  });
});

describe("once identity is real", () => {
  it("goes back to filtering the rail on the role's permissions", () => {
    // Live mode is the case where the role has actually been verified, so
    // hiding what it cannot use is meaningful again.
    renderAs("location_manager", false);
    expect(screen.queryByRole("link", { name: /Form Templates/ })).toBeNull();
    // Forms Register carries the permission this role DOES hold, so it is
    // what proves the filter is passing things through rather than hiding
    // everything. It was `Create a Form`, which no role is shown any more.
    expect(screen.getByRole("link", { name: /Forms Register/ })).toBeTruthy();
  });
});

describe("what an Employee sees on the rail with real authentication", () => {
  /*
   * THE ACCEPTANCE CRITERION FOR THE FRONTLINE ROLE, rendered rather than
   * computed: the assistant and its history. Nothing else, and no empty section
   * heading left behind where something was filtered out.
   *
   * `demoMode = false` throughout, because the whole point of this role is what
   * it looks like once identity is real.
   */
  /**
   * The links inside the NAVIGATION, not every link on screen.
   *
   * The rail's header also carries a brand link whose accessible name is
   * the product name — so a query across the whole tree would report the
   * wordmark as a navigation item. Scoping to the nav is what makes "an
   * Employee cannot see Home" mean the sidebar entry rather than the logo.
   */
  function navLinks(container: HTMLElement): string[] {
    const nav = container.querySelector("nav")!;
    return [...nav.querySelectorAll("a")].map((link) => {
      /*
       * Decorative nodes are excluded, not just the icons: an admin entry
       * renders an `aria-hidden` "Admin" pill INSIDE the link, so raw
       * textContent reads "User ManagementAdmin" and an exact-label assertion
       * fails on the one section this test most needs to check. Dropping
       * aria-hidden content gives the accessible name, which is the label a
       * person actually reads.
       */
      const clone = link.cloneNode(true) as HTMLElement;
      for (const hidden of clone.querySelectorAll("[aria-hidden]")) hidden.remove();
      return clone.textContent?.trim() ?? "";
    });
  }

  it("shows exactly the two screens it is entitled to", () => {
    const { container } = renderAs("employee", false);
    expect(navLinks(container).sort()).toEqual(["Ask Bubbles", "History"].sort());
  });

  it("does not offer the Knowledge Base management screen", () => {
    /*
     * The rail entry opens the corpus's management console — the inventory, the
     * counts, upload, delete, re-index — and that is administrators-only.
     *
     * An Employee keeps the knowledge: Bubbles still answers from these documents
     * and a citation still opens the one it cites, at `/knowledge/document/[id]`.
     * That route is reached from an answer, never from this rail, which is why
     * nothing replaces the entry here.
     */
    const { container } = renderAs("employee", false);
    expect(navLinks(container)).not.toContain("Knowledge Base");
    expect(container.querySelector('nav a[href="/knowledge"]')).toBeNull();
  });

  it("shows nothing it cannot open", () => {
    const { container } = renderAs("employee", false);
    const links = navLinks(container);

    for (const label of [
      "Home",
      "Reports",
      "Knowledge Base",
      "Create a Form",
      "Forms Register",
      "Form Templates",
      "Analytics",
      "AI Usage",
      "User Management",
      "Integrations",
    ]) {
      expect(links, label).not.toContain(label);
    }
  });

  it("leaves NO empty section headings behind", () => {
    /*
     * The failure this catches is cosmetic and reads as a bug: "Insights" with
     * nothing under it looks like content that failed to load, and an "Admin"
     * heading advertises a console the person cannot reach. Only the section
     * with surviving items may appear.
     */
    const { container } = renderAs("employee", false);
    const headings = [...container.querySelectorAll("nav p")].map(
      (node) => node.textContent?.trim() ?? "",
    );

    // "Knowledge" goes with its only entry, the administrators' Knowledge Base
    // console — the heading is wrong when NOTHING is under it.
    expect(headings.sort()).toEqual(["Assistant"]);
    for (const gone of ["Home", "Knowledge", "Insights", "Forms", "Admin"]) {
      expect(headings, gone).not.toContain(gone);
    }
  });

  it("gives an Admin the whole rail, including the admin console", () => {
    // The other end of the same filter, so a bug that hides everything from
    // everybody cannot pass the Employee assertions above.
    const { container } = renderAs("admin", false);
    const links = navLinks(container);

    for (const label of [
      "Home",
      "Ask Bubbles",
      "Knowledge Base",
      "Form Templates",
      "Reports",
      "Analytics",
      "User Management",
    ]) {
      expect(links, label).toContain(label);
    }
  });
});

describe("the app switcher on the rail", () => {
  /*
   * ADMINISTRATORS ONLY, and the decision is the server's (`pageShowsAppSwitcher`
   * in the layout). The rail never decides it from the browser's role: even an
   * owner session renders no switcher unless the server said so.
   */
  const switcher = () => screen.queryByRole("button", { name: /switch app/i });

  it.each(["desktop", "drawer"] as const)("is absent on the %s rail unless the server allows it", (variant) => {
    mocked.value = session("owner", false);
    render(<SidebarNav variant={variant} />);
    expect(switcher()).toBeNull();
  });

  it.each(["desktop", "drawer"] as const)("is present on the %s rail when the server allows it", (variant) => {
    mocked.value = session("owner", false);
    render(<SidebarNav variant={variant} showAppSwitcher />);
    expect(switcher()).not.toBeNull();
  });
});
