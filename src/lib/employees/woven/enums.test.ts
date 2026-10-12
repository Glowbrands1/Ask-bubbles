import { describe, expect, it } from "vitest";

import { employeeWebhookTriggers, parseEnums, statusKind, statusResolver, terminationTypeLabels, webhookTriggerVocabulary } from "./enums";
import { FAKE_ENUMS } from "./test-support";

describe("parseEnums", () => {
  it("reads EnumerationType[] and skips malformed entries", () => {
    const parsed = parseEnums([...FAKE_ENUMS, { EnumerationName: "X" }, "junk", { EnumerationName: "Y", PropertyName: "Z", PropertyValue: 1.5 }]);
    expect(parsed).toHaveLength(FAKE_ENUMS.length);
  });

  it("returns null for anything that is not an array", () => {
    expect(parseEnums({ Items: [] })).toBeNull();
    expect(parseEnums(null)).toBeNull();
  });
});

describe("statusResolver", () => {
  const statuses = statusResolver(parseEnums(FAKE_ENUMS));

  it("maps only Active and Terminated; every other label is unknown", () => {
    expect(statuses.source).toBe("enums");
    expect(statuses.resolve(1)).toBe("active");
    expect(statuses.resolve(2)).toBe("terminated");
    expect(statuses.resolve(3)).toBe("unknown");
    expect(statuses.resolve(42)).toBe("unknown");
    expect(statuses.resolve(null)).toBe("unknown");
  });

  it("never reads Inactive as terminated", () => {
    const r = statusResolver(parseEnums([{ EnumerationName: "EmployeeStatus", PropertyName: "Inactive", PropertyDisplayName: "Inactive", PropertyValue: 5 }]));
    expect(r.resolve(5)).toBe("unknown");
  });

  it("says so when no employee-status enumeration exists", () => {
    const r = statusResolver(parseEnums([{ EnumerationName: "AssetStatus", PropertyName: "Active", PropertyValue: 1 }]));
    expect(r.source).toBe("none");
    expect(r.resolve(1)).toBe("unknown");
  });

  it("matches the enumeration name case-insensitively", () => {
    const r = statusResolver(parseEnums([{ EnumerationName: "employeestatus", PropertyName: "Terminated", PropertyValue: 9 }]));
    expect(r.resolve(9)).toBe("terminated");
  });
});

describe("labels and webhook vocabulary", () => {
  it("reads TerminationType labels", () => {
    expect(terminationTypeLabels(parseEnums(FAKE_ENUMS))).toEqual({ 1: "Voluntary", 2: "Involuntary" });
  });

  it("lists webhook-trigger names, and finds no employee trigger in the fake vocabulary", () => {
    const entries = parseEnums(FAKE_ENUMS);
    expect(webhookTriggerVocabulary(entries)).toEqual({
      CompanyWebhookNotificationTrigger: [
        { value: 6, name: "Work Order Created" },
        { value: 8, name: "Work Order Updated" },
      ],
    });
    expect(employeeWebhookTriggers(entries)).toEqual([]);
  });

  it("finds employee triggers when Woven names them", () => {
    const entries = parseEnums([
      { EnumerationName: "CompanyWebhookNotificationTrigger", PropertyName: "EmployeeTerminated", PropertyDisplayName: "Employee Terminated", PropertyValue: 71 },
      { EnumerationName: "CompanyWebhookNotificationTrigger", PropertyName: "TeamMemberHired", PropertyValue: 72 },
    ]);
    expect(employeeWebhookTriggers(entries)).toEqual(["Employee Terminated", "TeamMemberHired"]);
  });
});

describe("statusKind — Woven's real EmployeeStatus vocabulary (Active=1, Terminated=2, Vendor=10, ActiveHidden=100)", () => {
  const real = statusResolver(
    parseEnums([
      { EnumerationName: "EmployeeStatus", PropertyName: "Active", PropertyDisplayName: "Active", PropertyValue: 1 },
      { EnumerationName: "EmployeeStatus", PropertyName: "Terminated", PropertyDisplayName: "Terminated", PropertyValue: 2 },
      { EnumerationName: "EmployeeStatus", PropertyName: "Vendor", PropertyDisplayName: "Vendor", PropertyValue: 10 },
      { EnumerationName: "EmployeeStatus", PropertyName: "ActiveHidden", PropertyDisplayName: "Active Hidden", PropertyValue: 100 },
    ]),
  );

  it("names each status for reporting", () => {
    expect(statusKind(real, 1)).toBe("active");
    expect(statusKind(real, 2)).toBe("terminated");
    expect(statusKind(real, 10)).toBe("vendor");
    expect(statusKind(real, 100)).toBe("active_hidden");
    expect(statusKind(real, 7)).toBe("unknown");
    expect(statusKind(real, null)).toBe("unknown");
  });

  it("ActiveHidden and Vendor stay unknown to every decision: never active, never terminated", () => {
    expect(real.resolve(100)).toBe("unknown");
    expect(real.resolve(10)).toBe("unknown");
  });
});
