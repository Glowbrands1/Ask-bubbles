import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

import type { FormsActor } from "./access";
import type { InstanceRow } from "./instances";

/*
 * QA's audit of Ask Bubbles (P2, 20 Nov 2026): findCrossChatOpenDraft read every open draft for the template and date with
 * the service-role client and handed back another manager's draft at a store the caller cannot see (its employee, store
 * and creator, returned as JSON by the create route). It must only return a draft the caller may see, and with
 * DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED the chat is keyed by the caller too. Invented names and ids only.
 */

const WEST = "loc-264";
const OTHER = "loc-67";
const DATE = "2026-11-18";

type Draft = { id: string; employeeName: string; locationId: string; createdBy: string };
let drafts: Draft[] = [];
let sameChatIds: Set<string> | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => {
    const query = {
      from(table: string) {
        this.table = table;
        return this;
      },
      table: "",
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return Promise.resolve({
          data: drafts.map((draft) => ({ id: draft.id, employee_name: draft.employeeName, created_at: "2026-11-18T15:00:00Z", form_date: DATE, status: "draft", created_by: draft.createdBy })),
          error: null,
        });
      },
      maybeSingle() {
        return Promise.resolve({ data: { id: "tpl-ca" }, error: null });
      },
    };
    return query;
  },
}));
vi.mock("./instances", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./instances")>()),
  loadInstance: async (id: string) => {
    const draft = drafts.find((row) => row.id === id);
    return draft ? { instance: { id, status: "draft", layoutFamily: "none", locationId: draft.locationId, createdBy: draft.createdBy, employeeName: draft.employeeName } as unknown as InstanceRow } : null;
  },
}));
vi.mock("./draft-same-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./draft-same-chat")>()),
  keepSameChat: async <T extends { id: string }>(rows: readonly T[], sameChat: unknown) => (sameChat ? rows.filter((row) => sameChatIds?.has(row.id)) : [...rows]),
}));

const { findCrossChatOpenDraft } = await import("./draft-reopen");

const scope = (locationId: string): AccessScope => ({ level: "location", primaryAreaId: locationId, alsoCoversAreaIds: [] });
const manager = (id: string, locationId: string): FormsActor => ({ id, role: "location_manager", verified: true, scope: scope(locationId), visibility: scope(locationId) }) as FormsActor;
const wanted = (actor: FormsActor, sameChat?: { conversationKey: string }) => ({ templateKey: "corrective-action", employeeName: "Remy Calder", formDate: DATE, actor, ...(sameChat ? { sameChat } : {}) });

beforeEach(() => {
  drafts = [];
  sameChatIds = null;
});

describe("findCrossChatOpenDraft returns only a draft the caller may see", () => {
  it("never returns another manager's draft at another store", async () => {
    drafts = [{ id: "theirs", employeeName: "Remy Calder", locationId: OTHER, createdBy: "user-other" }];
    expect(await findCrossChatOpenDraft(wanted(manager("user-west", WEST)))).toBeNull();
  });

  it("still reuses a draft at the caller's own store, another manager's included", async () => {
    drafts = [{ id: "same-store", employeeName: "Remy Calder", locationId: WEST, createdBy: "user-colleague" }];
    expect((await findCrossChatOpenDraft(wanted(manager("user-west", WEST))))?.id).toBe("same-store");
  });

  it("skips a hidden draft and takes the next one the caller may see", async () => {
    drafts = [
      { id: "theirs", employeeName: "Remy Calder", locationId: OTHER, createdBy: "user-other" },
      { id: "mine", employeeName: "Remy Calder", locationId: WEST, createdBy: "user-west" },
    ];
    expect((await findCrossChatOpenDraft(wanted(manager("user-west", WEST))))?.id).toBe("mine");
  });

  it("with the same-chat rule, a conversation id another user's draft carries never reaches that draft", async () => {
    drafts = [{ id: "theirs-same-store", employeeName: "Remy Calder", locationId: WEST, createdBy: "user-colleague" }];
    sameChatIds = new Set(["theirs-same-store"]);
    expect(await findCrossChatOpenDraft(wanted(manager("user-west", WEST), { conversationKey: "copied-chat-id" }))).toBeNull();
    drafts = [{ id: "mine", employeeName: "Remy Calder", locationId: WEST, createdBy: "user-west" }];
    sameChatIds = new Set(["mine"]);
    expect((await findCrossChatOpenDraft(wanted(manager("user-west", WEST), { conversationKey: "my-chat" })))?.id).toBe("mine");
  });
});
