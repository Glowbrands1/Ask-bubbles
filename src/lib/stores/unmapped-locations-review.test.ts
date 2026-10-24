import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The Colene location mapping is a review file. It must not invent Woven
 * ids or write a row. It is not applied by this test.
 */

const FILE = "supabase/migrations/20261024180000_colene_unmapped_woven_locations_review.sql";

describe("Colene's unmapped Woven locations, for review", () => {
  const sql = readFileSync(FILE, "utf8");

  it("names the six ignored locations and Empire, SD", () => {
    for (const name of ["Corporate", "Grand Forks", "Raymore", "Fargo", "Maintenance", "Empire, SD"]) {
      expect(sql).toContain(name);
    }
    expect(sql.match(/Corporate/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not write a mapping or assign Raymore to Lee's Summit", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(sql).toContain("must not be mapped to loc-219");
    expect(sql).not.toMatch(/location_id\s*[:=]\s*'loc-219'/i);
    expect(sql).not.toMatch(/woven_location_id\s*=\s*'/i);
    expect(sql).toContain("Do not apply");
    expect(sql).toContain("Pau");
  });
});
