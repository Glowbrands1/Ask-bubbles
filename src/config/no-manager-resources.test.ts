import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { visibleNavSections } from "@/components/shell/navigation";
import { AI_READABLE_PAGES } from "@/config/ai-readable-pages";
import { WHATS_NEW } from "@/config/whats-new";
import { agentLoopRules } from "@/lib/ai/agent-loop/prompt";
import { agentLoopTools } from "@/lib/ai/agent-loop/run";
import { DEFAULT_PERMISSION_MATRIX, PERMISSIONS, ROLES, canAccessAdminConsole, hasPermission } from "@/lib/permissions";

/**
 * The owner, 28 Nov 2026, about the sibling app's Manager Resources page: "hide this to everyone since i think all
 * inside are placeholders". Ask Bubbles never ported that page; this keeps it that way, so a port of the sibling's
 * page, sidebar entry or reader fails here until it is meant to be turned on.
 */
const OWNER = "hide this to everyone since i think all inside are placeholders";

describe(`no Manager Resources page: "${OWNER}" (the owner, 28 Nov 2026)`, () => {
  it("there is no /resources page", () => {
    expect(existsSync(join(process.cwd(), "src", "app", "(app)", "resources"))).toBe(false);
    expect(AI_READABLE_PAGES.map((page) => page.route)).not.toContain("/resources");
  });

  it("is on no role's sidebar, administrators included", () => {
    for (const role of ROLES) {
      const rail = visibleNavSections({
        can: (permission) => hasPermission(DEFAULT_PERMISSION_MATRIX, role, permission),
        isAdmin: canAccessAdminConsole(role),
        whatsNewVisible: true,
      });
      const items = rail.flatMap((section) => section.items);
      expect(items.map((item) => item.label), role).not.toContain("Manager Resources");
      expect(items.map((item) => item.href), role).not.toContain("/resources");
    }
  });

  it("there is no permission for it", () => {
    expect(PERMISSIONS as string[]).not.toContain("view_manager_resources");
  });

  it("the AI is not given a reader for it and is not told it exists", () => {
    const tools = agentLoopTools() as ReadonlyArray<{ name: string }>;
    expect(tools.map((tool) => tool.name)).not.toContain("read_manager_resources");
    expect(JSON.stringify(tools)).not.toMatch(/manager resources/i);
    expect(agentLoopRules()).not.toMatch(/manager resources/i);
  });

  it("no What's New entry tells anyone to open it", () => {
    expect(JSON.stringify(WHATS_NEW)).not.toMatch(/manager resources/i);
  });
});
