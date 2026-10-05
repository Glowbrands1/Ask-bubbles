import { describe, expect, it } from "vitest";

import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { AccessScope, Role } from "@/types";

import { QUICK_QUESTIONS, quickQuestionsFor } from "./quick-questions";

const scope = (level: AccessScope["level"]): AccessScope => ({
  level,
  primaryAreaId: null,
  alsoCoversAreaIds: [],
});

const canFor = (role: Role) => (permission: Parameters<typeof hasPermission>[2]) =>
  hasPermission(DEFAULT_PERMISSION_MATRIX, role, permission);

describe("starter questions", () => {
  it("offers frontline staff only what their role can act on", () => {
    const offered = quickQuestionsFor({ scope: scope("location"), can: canFor("employee") });
    expect(offered.length).toBeGreaterThan(0);
    for (const text of offered) {
      const question = QUICK_QUESTIONS.find((entry) => entry.text === text)!;
      if (question.needs) expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "employee", question.needs)).toBe(true);
    }
  });

  it("never promises report figures, since no report is connected", () => {
    for (const question of QUICK_QUESTIONS) {
      expect(question.text).not.toMatch(/\b(?:revenue|sales figures|latest data|daily stats)\b/i);
    }
  });

  it("offers more to a manager than to frontline staff", () => {
    const employee = quickQuestionsFor({ scope: scope("location"), can: canFor("employee") });
    const manager = quickQuestionsFor({ scope: scope("location"), can: canFor("location_manager") });
    expect(manager.length).toBeGreaterThanOrEqual(employee.length);
  });
});
