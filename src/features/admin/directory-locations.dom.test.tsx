// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { AccessScope, Permission, Role } from "@/types";

import { DirectoryScreen, type DirectoryUser } from "./directory-screen";

/**
 * ============================================================================
 * ADDITIONAL LOCATIONS IN THE INVITATION FORM AND THE USER LIST
 * ============================================================================
 *
 * What an administrator sees and what is sent. Nothing here is a boundary —
 * the server validates the same request — these tests protect the form from
 * offering what would be refused, and from sending something other than what
 * was on screen.
 */

/** The signed-in administrator's own scope; tests change it. */
const viewer = vi.hoisted(() => ({
  scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as {
    level: string;
    primaryAreaId: string | null;
    alsoCoversAreaIds: string[];
  },
}));

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({
    user: { id: "me-1", name: "Me", email: "me@example.test", avatarInitials: "ME", scope: viewer.scope },
    role: "admin" as Role,
    authenticated: true,
    demoMode: false,
    can: (permission: Permission) => hasPermission(DEFAULT_PERMISSION_MATRIX, "admin", permission),
    isAdmin: true,
  }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  // jsdom has no layout, and Radix dialogs call these.
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}
let calls: Call[];
let wovenAnswer: unknown;
let wovenStatus: number;
let inviteStatus: number;

beforeEach(() => {
  viewer.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  calls = [];
  wovenAnswer = { status: "not_found" };
  wovenStatus = 200;
  inviteStatus = 201;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (url.includes("invite-suggestion")) {
        return new Response(JSON.stringify(wovenAnswer), { status: wovenStatus });
      }
      if (method === "POST" && url.endsWith("/api/admin/users")) {
        const scope = (body?.scope ?? { level: "location", primaryAreaId: null, alsoCoversAreaIds: [] }) as AccessScope;
        return new Response(
          JSON.stringify({
            user: {
              id: "new-1",
              email: body?.email,
              displayName: body?.displayName,
              role: body?.role,
              status: "invited",
              scope,
              createdAt: "",
              updatedAt: "",
            },
          }),
          { status: inviteStatus },
        );
      }
      if (method === "PATCH") {
        const scope = (body?.scope ?? {}) as AccessScope;
        return new Response(
          JSON.stringify({ user: user({ id: url.split("/").pop(), scope }) }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

function user(overrides: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    id: "u-1",
    email: "manager@example.test",
    displayName: "A Manager",
    role: "location_manager",
    status: "active",
    scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

/** The picker's own options — native <select> options share the role. */
const pickerOptions = (dialog: HTMLElement) =>
  within(within(dialog).getByRole("listbox", { name: "Available locations" })).getAllByRole("option");
const pickerOption = (dialog: HTMLElement) => {
  const options = pickerOptions(dialog);
  expect(options).toHaveLength(1);
  return options[0]!;
};
const chips = (dialog: HTMLElement, id = "invite-additional") => within(within(dialog).getByTestId(`${id}-chips`));

async function openInvite() {
  const ui = userEvent.setup();
  render(<DirectoryScreen initialUsers={[user({ id: "admin-1", role: "admin", scope: GLOBAL })]} />);
  await ui.click(screen.getByRole("button", { name: /Invite someone/i }));
  return { ui, dialog: await screen.findByRole("dialog") };
}

describe("the invitation form", () => {
  it("shows Additional locations (optional) directly below Primary area", async () => {
    const { dialog } = await openInvite();
    const primary = within(dialog).getByLabelText("Primary area");
    const additional = within(dialog).getByLabelText(/Additional locations \(optional\)/);
    expect(primary.compareDocumentPosition(additional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And nothing sits between the two fields.
    const labels = [...dialog.querySelectorAll("label")].map((l) => l.textContent);
    const at = labels.findIndex((t) => t?.startsWith("Primary area"));
    expect(labels[at + 1]).toMatch(/Additional locations \(optional\)/);
  });

  it("starts empty, so one location needs no extra step", async () => {
    const { dialog } = await openInvite();
    expect(within(dialog).getByText("None selected")).toBeTruthy();
  });

  it("filters as you type and adds a location as a removable chip", async () => {
    const { ui, dialog } = await openInvite();
    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    await ui.click(box);
    await ui.type(box, "bellevue");
    const options = pickerOptions(dialog);
    expect(options.map((o) => o.textContent)).toEqual(["Bellevue, NE"]);

    await ui.click(options[0]!);
    expect(chips(dialog).getByText("Bellevue, NE")).toBeTruthy();
    expect(within(dialog).queryByText("None selected")).toBeNull();

    await ui.click(within(dialog).getByRole("button", { name: "Remove Bellevue, NE" }));
    expect(within(dialog).getByText("None selected")).toBeTruthy();
  });

  it("never offers the primary location, and never offers a chosen one twice", async () => {
    const { ui, dialog } = await openInvite();
    const primaryName = (within(dialog).getByLabelText("Primary area") as HTMLSelectElement).selectedOptions[0]!.textContent!;
    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    await ui.click(box);
    const names = () => pickerOptions(dialog).map((o) => o.textContent);
    expect(names()).not.toContain(primaryName);

    await ui.click(pickerOptions(dialog)[0]!);
    const taken = within(dialog).getByTestId("invite-additional-chips").textContent!;
    await ui.click(box);
    for (const name of names()) expect(taken).not.toContain(name!);
  });

  it("drops an additional location that becomes the primary", async () => {
    const { ui, dialog } = await openInvite();
    const primary = within(dialog).getByLabelText("Primary area") as HTMLSelectElement;
    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    await ui.click(box);
    await ui.type(box, "Bellevue");
    await ui.click(pickerOption(dialog));
    expect(chips(dialog).getByText("Bellevue, NE")).toBeTruthy();

    await ui.selectOptions(primary, "loc-67");
    expect(within(dialog).queryByRole("button", { name: "Remove Bellevue, NE" })).toBeNull();
  });

  it("sends primary and additional locations as stable ids, with role and scope", async () => {
    const { ui, dialog } = await openInvite();
    await ui.type(within(dialog).getByLabelText("Work email"), "kc.manager@example.com");
    await ui.type(within(dialog).getByLabelText("Full name"), "KC Manager");
    await ui.selectOptions(within(dialog).getByLabelText("Role"), "location_manager");
    await ui.selectOptions(within(dialog).getByLabelText("Primary area"), "loc-66");

    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    for (const term of ["Bellevue", "Lee"]) {
      await ui.click(box);
      await ui.type(box, term);
      await ui.click(pickerOption(dialog));
    }

    await ui.click(within(dialog).getByRole("button", { name: /Send invitation/ }));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/admin/users"))!;
    expect(post.body).toEqual({
      email: "kc.manager@example.com",
      displayName: "KC Manager",
      role: "location_manager",
      scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67", "loc-219"] },
    });
  });

  it("sends an empty list for somebody with one location", async () => {
    const { ui, dialog } = await openInvite();
    await ui.type(within(dialog).getByLabelText("Work email"), "one@example.com");
    await ui.type(within(dialog).getByLabelText("Full name"), "One Place");
    await ui.click(within(dialog).getByRole("button", { name: /Send invitation/ }));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/admin/users"))!;
    expect((post.body?.scope as AccessScope).alsoCoversAreaIds).toEqual([]);
  });

  it("a global scope hides the field and sends no additional locations", async () => {
    const { ui, dialog } = await openInvite();
    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    await ui.click(box);
    await ui.click(pickerOptions(dialog)[0]!);

    await ui.selectOptions(within(dialog).getByLabelText("Scope"), "global");
    expect(within(dialog).queryByLabelText(/Additional locations/)).toBeNull();

    await ui.type(within(dialog).getByLabelText("Work email"), "g@example.com");
    await ui.type(within(dialog).getByLabelText("Full name"), "Global Person");
    await ui.click(within(dialog).getByRole("button", { name: /Send invitation/ }));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/admin/users"))!;
    expect(post.body?.scope).toEqual({ level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  });

  it("a district or region has no configured areas yet, so it cannot be sent without a primary", async () => {
    const { ui, dialog } = await openInvite();
    await ui.selectOptions(within(dialog).getByLabelText("Scope"), "region");
    await ui.type(within(dialog).getByLabelText("Work email"), "rm@example.com");
    await ui.type(within(dialog).getByLabelText("Full name"), "Regional");
    expect((within(dialog).getByLabelText("Primary area") as HTMLSelectElement).value).toBe("");
    expect(within(dialog).getByRole("button", { name: /Send invitation/ }).hasAttribute("disabled")).toBe(true);
  });
});

describe("Woven suggestions", () => {
  const FOUND = {
    status: "found",
    employee: { name: "Harper Lyle", positionName: "Location Manager", primaryLocationName: "KC Wornall", employmentStatus: "active" },
    suggestion: {
      displayName: "Harper Lyle",
      role: "location_manager",
      scopeLevel: "location",
      primaryAreaId: "loc-66",
      additionalAreaIds: ["loc-67"],
    },
    notes: ["Not suggested, because they are not matched to an Ask Bubbles location: Brand New Store."],
  };

  async function typeEmail(dialog: HTMLElement, ui: ReturnType<typeof userEvent.setup>, email: string) {
    await ui.type(within(dialog).getByLabelText("Work email"), email);
    await ui.tab();
  }

  it("shows a match but fills nothing until the administrator applies it", async () => {
    wovenAnswer = FOUND;
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "harper.lyle@example.com");
    await within(dialog).findByText("Found in Woven");

    expect((within(dialog).getByLabelText("Full name") as HTMLInputElement).value).toBe("");
    expect((within(dialog).getByLabelText("Role") as HTMLSelectElement).value).toBe("employee");
    expect(within(dialog).getByText("None selected")).toBeTruthy();
    expect(within(dialog).getByText(/Brand New Store/)).toBeTruthy();
  });

  it("applies the suggestion on request, and every field stays editable", async () => {
    wovenAnswer = FOUND;
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "harper.lyle@example.com");
    await ui.click(await within(dialog).findByRole("button", { name: "Apply suggestions" }));

    expect((within(dialog).getByLabelText("Full name") as HTMLInputElement).value).toBe("Harper Lyle");
    expect((within(dialog).getByLabelText("Role") as HTMLSelectElement).value).toBe("location_manager");
    expect((within(dialog).getByLabelText("Primary area") as HTMLSelectElement).value).toBe("loc-66");
    expect(chips(dialog).getByText("Bellevue, NE")).toBeTruthy();

    // Override: choose a different role and remove the suggested location.
    await ui.selectOptions(within(dialog).getByLabelText("Role"), "assistant_manager");
    await ui.click(within(dialog).getByRole("button", { name: "Remove Bellevue, NE" }));
    await ui.click(within(dialog).getByRole("button", { name: /Send invitation/ }));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/admin/users"))!;
    expect(post.body?.role).toBe("assistant_manager");
    expect((post.body?.scope as AccessScope).alsoCoversAreaIds).toEqual([]);
  });

  it("leaves the primary area empty, and blocks sending, when Woven could not supply one", async () => {
    wovenAnswer = {
      ...FOUND,
      suggestion: { ...FOUND.suggestion, role: "district_manager", scopeLevel: "district", primaryAreaId: null, additionalAreaIds: [] },
    };
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "dm@example.com");
    await ui.click(await within(dialog).findByRole("button", { name: "Apply suggestions" }));
    expect((within(dialog).getByLabelText("Primary area") as HTMLSelectElement).value).toBe("");
    expect(within(dialog).getByRole("button", { name: /Send invitation/ }).hasAttribute("disabled")).toBe(true);
  });

  it("says so for an unknown email and leaves the form alone", async () => {
    wovenAnswer = { status: "not_found" };
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "stranger@example.com");
    await within(dialog).findByText(/No employee with this email was found in Woven/);
    expect((within(dialog).getByLabelText("Role") as HTMLSelectElement).value).toBe("employee");
  });

  it("offers nothing to apply when Woven suggests nothing (terminated)", async () => {
    wovenAnswer = { ...FOUND, suggestion: null, notes: ["Woven shows this person as terminated, so nothing is suggested."] };
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "gone@example.com");
    await within(dialog).findByText(/terminated/);
    expect(within(dialog).queryByRole("button", { name: "Apply suggestions" })).toBeNull();
  });

  it("is silent when the lookup is not permitted or fails, and the form still works", async () => {
    wovenStatus = 403;
    wovenAnswer = { error: "no" };
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "someone@example.com");
    await waitFor(() => expect(calls.some((c) => c.url.includes("invite-suggestion"))).toBe(true));
    expect(within(dialog).queryByText("Found in Woven")).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Send invitation/ })).toBeTruthy();
  });

  it("does not look up something that is not an email address", async () => {
    const { ui, dialog } = await openInvite();
    await typeEmail(dialog, ui, "not-an-email");
    expect(calls.some((c) => c.url.includes("invite-suggestion"))).toBe(false);
  });
});

describe("editing locations after the account exists", () => {
  it("shows additional locations in the list", () => {
    render(
      <DirectoryScreen
        initialUsers={[
          user({ id: "admin-1", role: "admin", scope: GLOBAL }),
          user({ scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67", "loc-219"] } }),
        ]}
      />,
    );
    expect(screen.getByText(/Also: Bellevue, NE, Lee's Summit, MO/)).toBeTruthy();
  });

  it("offers Edit locations to a scoped account but not a global one", () => {
    render(<DirectoryScreen initialUsers={[user({ id: "admin-1", role: "admin", scope: GLOBAL }), user()]} />);
    expect(screen.getAllByRole("button", { name: /Edit locations/ })).toHaveLength(1);
  });

  it("saves only the additional locations, leaving level and primary exactly as they were", async () => {
    const ui = userEvent.setup();
    render(
      <DirectoryScreen
        initialUsers={[
          user({ id: "admin-1", role: "admin", scope: GLOBAL }),
          user({ scope: { level: "district", primaryAreaId: "dist-a", alsoCoversAreaIds: [] } }),
        ]}
      />,
    );
    await ui.click(screen.getByRole("button", { name: /Edit locations/ }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save locations" });
    expect(save.hasAttribute("disabled")).toBe(true); // unchanged

    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    await ui.click(box);
    await ui.type(box, "Bellevue");
    await ui.click(pickerOption(dialog));
    await ui.click(save);

    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/admin/users/u-1");
    expect(patch.body).toEqual({
      scope: { level: "district", primaryAreaId: "dist-a", alsoCoversAreaIds: ["loc-67"] },
    });
    expect(patch.body).not.toHaveProperty("role");
    expect(patch.body).not.toHaveProperty("status");
  });

  it("can remove an existing additional location", async () => {
    const ui = userEvent.setup();
    render(
      <DirectoryScreen
        initialUsers={[
          user({ id: "admin-1", role: "admin", scope: GLOBAL }),
          user({ scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67", "loc-219"] } }),
        ]}
      />,
    );
    await ui.click(screen.getByRole("button", { name: /Edit locations/ }));
    const dialog = await screen.findByRole("dialog");
    await ui.click(within(dialog).getByRole("button", { name: "Remove Bellevue, NE" }));
    await ui.click(within(dialog).getByRole("button", { name: "Save locations" }));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect((patch.body?.scope as AccessScope).alsoCoversAreaIds).toEqual(["loc-219"]);
  });

  it("keeps a district or region already held, instead of dropping it silently", async () => {
    const ui = userEvent.setup();
    render(
      <DirectoryScreen
        initialUsers={[
          user({ id: "admin-1", role: "admin", scope: GLOBAL }),
          user({
            role: "district_manager",
            scope: { level: "district", primaryAreaId: "dist-a", alsoCoversAreaIds: ["dist-b"] },
          }),
        ]}
      />,
    );
    await ui.click(screen.getByRole("button", { name: /Edit locations/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("dist-b")).toBeTruthy();

    const box = within(dialog).getByRole("combobox", { name: /Additional locations/ });
    await ui.click(box);
    await ui.type(box, "Bellevue");
    await ui.click(pickerOption(dialog));
    await ui.click(within(dialog).getByRole("button", { name: "Save locations" }));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect((patch.body?.scope as AccessScope).alsoCoversAreaIds).toEqual(["dist-b", "loc-67"]);
  });
});

describe("what the form offers an administrator", () => {
  const primaryChoices = (dialog: HTMLElement) =>
    [...(within(dialog).getByLabelText("Primary area") as HTMLSelectElement).options].map((o) => o.value);

  it("a global administrator is offered all 7 configured locations, and Everything", async () => {
    const { ui, dialog } = await openInvite();
    expect(primaryChoices(dialog)).toEqual(["loc-66", "loc-67", "loc-219", "loc-225", "loc-236", "loc-264", "loc-338"]);
    expect([...(within(dialog).getByLabelText("Scope") as HTMLSelectElement).options].map((o) => o.value)).toContain("global");

    // And every one of the 7 can be added as an additional location (the primary, loc-66, is the only exclusion).
    await ui.click(within(dialog).getByRole("combobox", { name: /Additional locations/ }));
    expect(pickerOptions(dialog).map((o) => o.textContent)).toEqual([
      "Bellevue, NE",
      "Lee's Summit, MO",
      "Sioux Falls, SD (W 41st St)",
      "Grand Island, NE",
      "Omaha, NE (West Dodge Rd)",
      "Sioux Falls, SD (E 18th St)",
    ]);
  });

  it("a scoped administrator is offered only their own locations, and not Everything", async () => {
    viewer.scope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67", "loc-219"] };
    const { ui, dialog } = await openInvite();
    expect(primaryChoices(dialog)).toEqual(["loc-66", "loc-67", "loc-219"]);
    expect([...(within(dialog).getByLabelText("Scope") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("global");

    await ui.click(within(dialog).getByRole("combobox", { name: /Additional locations/ }));
    expect(pickerOptions(dialog).map((o) => o.textContent)).toEqual(["Bellevue, NE", "Lee's Summit, MO"]);
  });

  it("in Edit locations a scoped administrator is offered only their own, but still sees and can remove what the person holds", async () => {
    viewer.scope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67"] };
    const ui = userEvent.setup();
    render(
      <DirectoryScreen
        initialUsers={[user({ scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-338"] } })]}
      />,
    );
    await ui.click(screen.getByRole("button", { name: /Edit locations/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sioux Falls, SD (E 18th St)")).toBeTruthy(); // held, outside their reach: visible
    await ui.click(within(dialog).getByRole("combobox", { name: /Additional locations/ }));
    expect(pickerOptions(dialog).map((o) => o.textContent)).toEqual(["Bellevue, NE"]);
    await ui.click(within(dialog).getByRole("button", { name: "Remove Sioux Falls, SD (E 18th St)" }));
    await ui.click(within(dialog).getByRole("button", { name: "Save locations" }));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] },
    });
  });
});
