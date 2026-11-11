import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/types";
import type { AuthenticatedIdentity } from "./types";

const page = vi.hoisted(() => ({
  enforced: true,
  identity: null as Partial<AuthenticatedIdentity> | null | Error,
}));

vi.mock("./page", () => ({
  pageAuthorizationEnforced: () => page.enforced,
  pageIdentity: async () => {
    if (page.identity instanceof Error) throw page.identity;
    return page.identity;
  },
}));

import {
  APP_SWITCHER_USER_IDS,
  emailOnLeadershipHubList,
  pageShowsAppSwitcher,
  pageShowsLeadershipHubTab,
} from "./app-switcher";

function signedInAs(role: Role, verified = true, subject = "someone-else") {
  page.identity = { role, verified, subject };
}

beforeEach(() => {
  page.enforced = true;
  page.identity = null;
});

describe("who is offered the app switcher", () => {
  it.each<Role>(["admin", "owner", "developer"])("a verified %s is", async (role) => {
    signedInAs(role);
    expect(await pageShowsAppSwitcher()).toBe(true);
  });

  it("no other role is", async () => {
    const { ROLES, canAccessAdminConsole } = await import("@/lib/permissions");
    for (const role of ROLES.filter((r) => !canAccessAdminConsole(r))) {
      signedInAs(role);
      expect(await pageShowsAppSwitcher(), role).toBe(false);
    }
  });

  it("an administrator role that is not verified is not", async () => {
    signedInAs("admin", false);
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("nobody signed in is not", async () => {
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("demo mode never is, whatever role the browser claims", async () => {
    page.enforced = false;
    signedInAs("admin");
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("a failed identity lookup is not", async () => {
    page.identity = new Error("auth provider down");
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  describe("the two named non-administrators", () => {
    const [delphine, dj] = APP_SWITCHER_USER_IDS;

    it("the District Manager and the Regional Manager are, by user id", async () => {
      signedInAs("district_manager", true, delphine);
      expect(await pageShowsAppSwitcher()).toBe(true);
      signedInAs("regional_manager", true, dj);
      expect(await pageShowsAppSwitcher()).toBe(true);
    });

    it("an unrelated district or regional manager is not", async () => {
      signedInAs("district_manager");
      expect(await pageShowsAppSwitcher()).toBe(false);
      signedInAs("regional_manager");
      expect(await pageShowsAppSwitcher()).toBe(false);
    });

    it("their email does not grant it — only the id does", async () => {
      page.identity = {
        role: "district_manager",
        verified: true,
        subject: "other-id",
        email: "delphine.ashworth@glowbrands.com",
      };
      expect(await pageShowsAppSwitcher()).toBe(false);
    });

    it("an unverified identity carrying their id is not", async () => {
      signedInAs("district_manager", false, delphine);
      expect(await pageShowsAppSwitcher()).toBe(false);
    });

    it("demo mode is not, even with their id", async () => {
      page.enforced = false;
      signedInAs("district_manager", true, delphine);
      expect(await pageShowsAppSwitcher()).toBe(false);
    });

    it("does not make them administrators", async () => {
      const { canAccessAdminConsole } = await import("@/lib/permissions");
      expect(canAccessAdminConsole("district_manager")).toBe(false);
      expect(canAccessAdminConsole("regional_manager")).toBe(false);
      expect(APP_SWITCHER_USER_IDS).toHaveLength(2);
    });
  });
});

describe("who sees the Leadership Hub tab", () => {
  const LIST = "leader@example.test, Second.Leader@Example.test ,";

  beforeEach(() => {
    process.env.LEADERSHIP_HUB_TAB_EMAILS = LIST;
  });
  afterEach(() => {
    delete process.env.LEADERSHIP_HUB_TAB_EMAILS;
  });

  function signedInWithEmail(email: string, verified = true) {
    page.identity = { role: "admin", verified, subject: "x", email };
  }

  it("shows for a listed email", async () => {
    signedInWithEmail("leader@example.test");
    expect(await pageShowsLeadershipHubTab()).toBe(true);
  });

  it("matches case-insensitively and ignores spaces", async () => {
    signedInWithEmail("  LEADER@Example.TEST ");
    expect(await pageShowsLeadershipHubTab()).toBe(true);
    signedInWithEmail("second.leader@example.test");
    expect(await pageShowsLeadershipHubTab()).toBe(true);
  });

  it("hides for any other email, even an administrator", async () => {
    signedInWithEmail("someone@example.test");
    expect(await pageShowsLeadershipHubTab()).toBe(false);
  });

  it("hides when signed out or unverified", async () => {
    page.identity = null;
    expect(await pageShowsLeadershipHubTab()).toBe(false);
    signedInWithEmail("leader@example.test", false);
    expect(await pageShowsLeadershipHubTab()).toBe(false);
  });

  it("hides when the variable is unset or empty", async () => {
    signedInWithEmail("leader@example.test");
    delete process.env.LEADERSHIP_HUB_TAB_EMAILS;
    expect(await pageShowsLeadershipHubTab()).toBe(false);
    process.env.LEADERSHIP_HUB_TAB_EMAILS = " , ";
    expect(await pageShowsLeadershipHubTab()).toBe(false);
  });

  it("also offers the whole switcher to a listed non-administrator, and not to an unlisted one", async () => {
    page.identity = { role: "employee", verified: true, subject: "x", email: "LEADER@example.test" };
    expect(await pageShowsAppSwitcher()).toBe(true);
    page.identity = { role: "employee", verified: true, subject: "x", email: "other@example.test" };
    expect(await pageShowsAppSwitcher()).toBe(false);
    delete process.env.LEADERSHIP_HUB_TAB_EMAILS;
    page.identity = { role: "employee", verified: true, subject: "x", email: "leader@example.test" };
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("hides when authorization is not enforced or the lookup throws", async () => {
    signedInWithEmail("leader@example.test");
    page.enforced = false;
    expect(await pageShowsLeadershipHubTab()).toBe(false);
    page.enforced = true;
    page.identity = new Error("boom");
    expect(await pageShowsLeadershipHubTab()).toBe(false);
  });

  it("an empty email never matches", () => {
    expect(emailOnLeadershipHubList("leader@example.test", "")).toBe(false);
    expect(emailOnLeadershipHubList("leader@example.test", undefined)).toBe(false);
  });
});
