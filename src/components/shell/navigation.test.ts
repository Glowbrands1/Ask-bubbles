import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PERMISSION_MATRIX,
  ROLES,
  canAccessAdminConsole,
  hasPermission,
} from "@/lib/permissions";
import type { Role } from "@/types";

import { isActivePath, NAV_SECTIONS, type NavItem } from "./navigation";

/**
 * WHERE THE SIDEBAR SENDS PEOPLE. The rail is not a security boundary — the
 * page guards and `authorizeRequest` are — but it is what somebody believes
 * the product contains, so every link must be one the role can actually open,
 * and every page a role can open must have a way in.
 */

const ALL_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ section, item })),
);

function itemByHref(href: string): NavItem {
  const item = ALL_ITEMS.find((entry) => entry.item.href === href)?.item;
  if (!item) throw new Error(`No sidebar item for "${href}"`);
  return item;
}

function visibleTo(role: Role): NavItem[] {
  return NAV_SECTIONS.flatMap((section) => {
    if (section.admin && !canAccessAdminConsole(role)) return [];
    return section.items.filter((item) => {
      if (item.adminOnly && !canAccessAdminConsole(role)) return false;
      return !item.permission || hasPermission(DEFAULT_PERMISSION_MATRIX, role, item.permission);
    });
  });
}

const ROUTE_TO_FILE: Record<string, string> = {
  "/": "src/app/(app)/page.tsx",
  "/chat": "src/app/(app)/chat/page.tsx",
  "/history": "src/app/(app)/history/page.tsx",
  "/knowledge": "src/app/(app)/knowledge/page.tsx",
  "/forms/monitoring": "src/app/(app)/forms/monitoring/page.tsx",
  "/forms/templates": "src/app/(app)/forms/templates/page.tsx",
  "/reports": "src/app/(app)/reports/page.tsx",
  "/admin/analytics": "src/app/(app)/admin/analytics/page.tsx",
  "/admin/ai-usage": "src/app/(app)/admin/ai-usage/page.tsx",
  "/admin/users": "src/app/(app)/admin/users/page.tsx",
  "/admin/integrations": "src/app/(app)/admin/integrations/page.tsx",
};

describe("the navigation's shape", () => {
  it("offers Home, the assistant, History, Knowledge, Forms, Reports and Admin", () => {
    for (const href of ["/", "/chat", "/history", "/knowledge", "/forms/monitoring", "/reports", "/admin/users"]) {
      expect(itemByHref(href)).toBeDefined();
    }
  });

  it("points only at root-relative internal paths", () => {
    for (const { item } of ALL_ITEMS) {
      expect(item.href, item.label).toMatch(/^\//);
      expect(item.href, item.label).not.toContain("://");
    }
  });

  it("gives every item a permission, so nothing is visible by default", () => {
    for (const { item } of ALL_ITEMS) {
      expect(item.permission, item.label).toBeDefined();
    }
  });

  it("never leaves an empty section", () => {
    for (const section of NAV_SECTIONS) expect(section.items.length, section.id).toBeGreaterThan(0);
  });
});

describe("active state", () => {
  it("keeps Reports lit on any report page", () => {
    const reports = itemByHref("/reports");
    expect(isActivePath("/reports", reports)).toBe(true);
    expect(isActivePath("/reports/anything", reports)).toBe(true);
    expect(isActivePath("/reportsx", reports)).toBe(false);
  });

  it("does not mark Home active everywhere", () => {
    const home = itemByHref("/");
    expect(isActivePath("/", home)).toBe(true);
    expect(isActivePath("/chat", home)).toBe(false);
  });
});

describe("what each role sees on the rail", () => {
  it("shows frontline staff the assistant and History, and nothing administrative", () => {
    const hrefs = visibleTo("employee").map((item) => item.href);
    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/history");
    expect(hrefs).not.toContain("/reports");
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/knowledge");
  });

  it("hides the admin section from every role below the admin console", () => {
    for (const role of ROLES) {
      const hrefs = visibleTo(role).map((item) => item.href);
      if (!canAccessAdminConsole(role)) {
        expect(hrefs.some((href) => href.startsWith("/admin/")), role).toBe(false);
      }
    }
  });

  it("matches each item's permission to the gate on the page it opens", () => {
    for (const { item } of ALL_ITEMS) {
      const file = ROUTE_TO_FILE[item.href];
      expect(file, `no page mapped for ${item.href}`).toBeDefined();
      expect(existsSync(file!), file).toBe(true);
      const source = readFileSync(file!, "utf8");
      expect(source, `${item.label} -> ${file}`).toMatch(
        new RegExp(`require(PagePermission|AdminConsolePage)\\("${item.permission}"\\)`),
      );
      if (item.adminOnly) {
        expect(source, `${item.label} -> ${file}`).toContain("requireAdminConsolePage(");
      }
    }
  });
});
