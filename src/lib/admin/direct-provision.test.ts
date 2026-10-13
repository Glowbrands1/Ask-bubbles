import { describe, expect, it } from "vitest";

import {
  generateTemporaryPassword,
  validateDirectProvision,
  type DirectProvisionInput,
} from "./direct-provision";

const roster = {
  locationIds: ["loc-101"],
  districtIds: ["dist-north"],
  regionIds: ["reg-midwest"],
};

const base: DirectProvisionInput = {
  email: " DJ.Wade@Glowbrands.com ",
  displayName: "DJ Wade",
  role: "regional_manager",
  scopeLevel: "region",
  areaId: "reg-midwest",
  grantSwitch: true,
};

const problems = (input: Partial<DirectProvisionInput>) => {
  const result = validateDirectProvision({ ...base, ...input }, roster);
  return result.ok ? [] : result.problems;
};

describe("direct provisioning validation", () => {
  it("accepts a manager with a rostered area and normalises the email", () => {
    const result = validateDirectProvision(base, roster);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.email).toBe("dj.wade@glowbrands.com");
  });

  it.each(["admin", "owner", "developer", "superuser", ""])("refuses role %j", (role) => {
    expect(problems({ role }).join(" ")).toMatch(/cannot be provisioned/);
  });

  it("refuses global scope outright", () => {
    expect(problems({ scopeLevel: "global", areaId: "" }).join(" ")).toMatch(/Global scope is refused/);
  });

  it("refuses an area the roster does not know — no placeholder ids", () => {
    expect(problems({ areaId: "reg-unassigned" }).join(" ")).toMatch(/not on the Ask Bubbles region roster/);
  });

  it("refuses an area whose prefix does not match the level", () => {
    expect(problems({ scopeLevel: "district", areaId: "reg-midwest" }).join(" ")).toMatch(/must start with "dist-"/);
  });

  it("refuses everything while the roster is empty", () => {
    const empty = { locationIds: [], districtIds: [], regionIds: [] };
    const result = validateDirectProvision(base, empty);
    expect(result.ok).toBe(false);
  });

  it("requires a name and a plausible email", () => {
    expect(problems({ displayName: " " }).join(" ")).toMatch(/display name/);
    expect(problems({ email: "nope" }).join(" ")).toMatch(/not an email/);
  });
});

describe("temporary password", () => {
  const seeded = () => {
    let n = 7;
    return () => (n = (n * 73 + 41) % 256);
  };

  it("is 24 characters with every character class, and varies with its random source", () => {
    const a = generateTemporaryPassword(seeded());
    expect(a).toHaveLength(24);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/[0-9]/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
    let m = 3;
    const b = generateTemporaryPassword(() => (m = (m * 31 + 17) % 256));
    expect(b).not.toBe(a);
  });

  it("never emits look-alike characters", () => {
    for (let i = 0; i < 50; i++) {
      let s = i + 1;
      expect(generateTemporaryPassword(() => (s = (s * 131 + 29) % 256))).not.toMatch(/[lIO01]/);
    }
  });
});
