import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccessScope, Role } from "@/types";

import { dataToolHandlers, readWhatsNew } from "./data-tools";

/** read_whats_new (Pau, 26 Nov 2026; port from the sibling app): the What's New page's list, scoped as the page is. */
const STORE: AccessScope = { level: "location", primaryAreaId: "loc-1", alsoCoversAreaIds: [] } as unknown as AccessScope;
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as unknown as AccessScope;
const ctx = (role: Role, scope: AccessScope, question: string) => ({ actor: { role, scope }, question, scopeId: "s", today: "2026-11-26" });

const entry = (title: string, permission?: "manage_integrations" | "view_reports") =>
  ({ tag: "New" as const, title, before: "What it was like before.", now: "What it does now.", howToUse: "Ask Bubbles about it.", ...(permission ? { permission, showMe: { href: "/reviews", label: "Google Reviews" } } : {}) });
const RELEASES = [
  { date: "2026-11-26", summary: "The newest release.", entries: [entry("Admin thing", "manage_integrations"), entry("Everyone thing")] },
  { date: "2026-11-20", summary: "An older release.", entries: [entry("Older thing", "view_reports")] },
];
type Out = { releases?: { date: string; summary: string; updates: { title: string; tag: string; how_to_use: string; show_me?: unknown }[] }[]; refused?: string };
const titles = (out: Out) => (out.releases ?? []).flatMap((release) => release.updates.map((update) => update.title));

describe("read_whats_new", () => {
  // Rolled out for these cases; hidden for everyone by default (Pau, 27 Nov 2026), see the case after them.
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_WHATS_NEW_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("a store manager gets the entries their role may open, newest release first, with tag, how to use it and Show me", async () => {
    const out = (await readWhatsNew(ctx("location_manager", STORE, "what's new?"), {}, RELEASES)) as Out;
    expect(titles(out)).toEqual(["Everyone thing", "Older thing"]);
    expect(out.releases?.[0]).toMatchObject({ date: "Nov 26, 2026", summary: "The newest release." });
    expect(out.releases?.[1]?.updates[0]).toMatchObject({ tag: "New", how_to_use: "Ask Bubbles about it.", show_me: { page: "Google Reviews", link: "/reviews" } });
  });

  it("an administrator gets every entry; since keeps the releases from that day on", async () => {
    const all = (await readWhatsNew(ctx("admin", GLOBAL, "what's new?"), {}, RELEASES)) as Out;
    expect(titles(all)).toEqual(["Admin thing", "Everyone thing", "Older thing"]);
    const week = (await readWhatsNew(ctx("admin", GLOBAL, "what's new this week?"), { since: "2026-11-24" }, RELEASES)) as Out;
    expect(titles(week)).toEqual(["Admin thing", "Everyone thing"]);
  });

  it("a role that cannot open the What's New page is refused and reads nothing", async () => {
    const out = (await readWhatsNew(ctx("employee", STORE, "what's new?"), {}, RELEASES)) as Out;
    expect(out.refused).toBeTruthy();
    expect(out.releases).toBeUndefined();
  });

  it("Pau, 27 Nov 2026 (\"hide this for everyone, for now pls, i will roll it out later\"): off, even an administrator reads nothing and is told not to point at the page", async () => {
    vi.stubEnv("NEXT_PUBLIC_WHATS_NEW_ENABLED", undefined);
    const out = (await readWhatsNew(ctx("admin", GLOBAL, "what's new?"), {}, RELEASES)) as Out;
    expect(out.releases).toBeUndefined();
    expect(out.refused).toContain("do not mention a What's New page");
  });

  it("is one of the loop's handlers", () => {
    expect(Object.keys(dataToolHandlers(ctx("admin", GLOBAL, "")))).toContain("read_whats_new");
  });
});
