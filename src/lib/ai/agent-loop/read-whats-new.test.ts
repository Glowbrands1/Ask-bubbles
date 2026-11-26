import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccessScope, Role } from "@/types";

import { dataToolHandlers, readWhatsNew } from "./data-tools";

/** read_whats_new (Pau, 26 Nov 2026; port from the sibling app): the What's New page's list, scoped as the page is. */
const STORE: AccessScope = { level: "location", primaryAreaId: "loc-1", alsoCoversAreaIds: [] } as unknown as AccessScope;
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as unknown as AccessScope;
const ctx = (role: Role, scope: AccessScope, question: string) => ({ actor: { role, scope }, question, scopeId: "s", today: "2026-11-26" });

const ENTRIES = [
  { date: "2026-11-26", title: "Admin thing", description: "Only administrators can open this page today.", href: "/admin/integrations/woven", permission: "manage_integrations" as const },
  { date: "2026-11-25", title: "Everyone thing", description: "Every manager has this one in the app now." },
  { date: "2026-11-20", title: "Older thing", description: "An older update from the week before this one.", href: "/reviews", permission: "view_reports" as const },
];
type Out = { updates?: { title: string; date: string }[]; refused?: string };

describe("read_whats_new", () => {
  it("a store manager gets the entries their role may open, newest first, and not an administrators' one", async () => {
    const out = (await readWhatsNew(ctx("location_manager", STORE, "what's new?"), {}, ENTRIES)) as Out;
    expect(out.updates?.map((update) => update.title)).toEqual(["Everyone thing", "Older thing"]);
    expect(out.updates?.[0]?.date).toBe("Nov 25, 2026");
  });

  it("an administrator gets every entry; since keeps the entries from that day on", async () => {
    const all = (await readWhatsNew(ctx("admin", GLOBAL, "what's new?"), {}, ENTRIES)) as Out;
    expect(all.updates?.map((update) => update.title)).toEqual(["Admin thing", "Everyone thing", "Older thing"]);
    const week = (await readWhatsNew(ctx("admin", GLOBAL, "what's new this week?"), { since: "2026-11-24" }, ENTRIES)) as Out;
    expect(week.updates?.map((update) => update.title)).toEqual(["Admin thing", "Everyone thing"]);
  });

  it("a role that cannot open the What's New page is refused and reads nothing", async () => {
    const out = (await readWhatsNew(ctx("employee", STORE, "what's new?"), {}, ENTRIES)) as Out;
    expect(out.refused).toBeTruthy();
    expect(out.updates).toBeUndefined();
  });

  it("is one of the loop's handlers", () => {
    expect(Object.keys(dataToolHandlers(ctx("admin", GLOBAL, "")))).toContain("read_whats_new");
  });
});
