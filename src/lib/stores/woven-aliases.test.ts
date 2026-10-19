import { beforeEach, describe, expect, it, vi } from "vitest";

import { PINNED_COMPANY_ID } from "@/lib/employees/woven/config";

const calls: { table: string; filters: [string, unknown][] }[] = [];
let result: { data: unknown[] | null; error: unknown };

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const call = { table, filters: [] as [string, unknown][] };
      calls.push(call);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return chain;
        },
        limit: async () => result,
      };
      return chain;
    },
  }),
}));

const { clearWovenStoreAliasCache, loadStoreIndex, loadWovenStoreAliases } = await import("./woven-aliases");
const { resolveStoreText } = await import("./resolver");

beforeEach(() => {
  calls.length = 0;
  clearWovenStoreAliasCache();
});

describe("the Woven names a person mapped to a registered store", () => {
  it("reads only mapped rows of the pinned company, read-only", async () => {
    result = { data: [], error: null };
    await loadWovenStoreAliases();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe("woven_location_map");
    expect(calls[0]!.filters).toEqual([
      ["status", "mapped"],
      ["woven_company_id", PINNED_COMPANY_ID],
    ]);
  });

  it("turns names and numbers into aliases and skips closed locations", async () => {
    result = {
      error: null,
      data: [
        { woven_location_name: "NE Kearney", woven_display_name: "NE Kearney", woven_location_number: "66", location_id: "loc-66", is_closed: false },
        { woven_location_name: "SD Dawley Farms", woven_display_name: null, woven_location_number: null, location_id: "loc-338", is_closed: null },
        { woven_location_name: "MO Raymore", woven_display_name: null, woven_location_number: "9", location_id: "loc-219", is_closed: true },
      ],
    };
    const aliases = await loadWovenStoreAliases();
    expect(aliases).toContainEqual({ storeId: "loc-66", kind: "woven_name", text: "NE Kearney" });
    expect(aliases).toContainEqual({ storeId: "loc-66", kind: "woven_number", text: "66" });
    expect(aliases).toContainEqual({ storeId: "loc-338", kind: "woven_name", text: "SD Dawley Farms" });
    expect(aliases.some((alias) => alias.text.includes("Raymore"))).toBe(false);
  });

  it("falls back to the registered roster when the read fails — never fails a conversation", async () => {
    result = { data: null, error: { message: "boom" } };
    expect(await loadWovenStoreAliases()).toEqual([]);
    const index = await loadStoreIndex();
    expect(resolveStoreText("Kearney, NE", index)).toMatchObject({ kind: "resolved" });
  });

  it("is cached briefly, so a message does not cost a read", async () => {
    result = { data: [], error: null };
    await loadWovenStoreAliases(1_000);
    await loadWovenStoreAliases(2_000);
    expect(calls).toHaveLength(1);
    await loadWovenStoreAliases(1_000 + 6 * 60 * 1000);
    expect(calls).toHaveLength(2);
  });

  it("makes a mapped Woven name resolve to the registered store", async () => {
    result = { data: [{ woven_location_name: "SD Dawley Farms", woven_display_name: null, woven_location_number: null, location_id: "loc-338", is_closed: false }], error: null };
    const index = await loadStoreIndex();
    expect(resolveStoreText("SD Dawley Farms", index)).toMatchObject({ kind: "resolved", store: { code: "338" } });
  });
});
