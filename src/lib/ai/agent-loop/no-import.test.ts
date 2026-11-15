import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * The agent-loop helpers ported from Ask Sunny (time limits, switch, dates) are UNUSED in this app until the loop
 * itself is ported. Nothing outside these files may import them, so today's chat path behaves exactly as before.
 */
const ROOT = join(process.cwd(), "src");
const HELPERS = ["lib/ai/agent-loop/", "lib/ai/time-limit.ts", "lib/ai/time-limit.test.ts", "lib/ai/ai-route.ts", "lib/config/ai-timeouts.ts"];
const IMPORTS = /(?:from|import\(|require\()\s*["']([^"']*(?:agent-loop\/switch|agent-loop\/dates|ai\/time-limit|config\/ai-timeouts|\.\/time-limit|\.\/ai-route|ai\/ai-route))["']/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

describe("the ported agent-loop helpers are not imported by today's path", () => {
  it("no file outside the helpers imports agent-loop/switch, agent-loop/dates, ai/time-limit, ai/ai-route or config/ai-timeouts", () => {
    const offenders: string[] = [];
    for (const file of files(ROOT)) {
      const path = relative(ROOT, file).split("\\").join("/");
      if (HELPERS.some((helper) => path === helper || path.startsWith(helper))) continue;
      for (const match of readFileSync(file, "utf8").matchAll(IMPORTS)) offenders.push(`${path} → ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the pattern catches each import form (self-check)", () => {
    for (const line of ['import { x } from "@/lib/ai/agent-loop/switch";', 'await import("../agent-loop/dates")', 'from "@/lib/ai/time-limit"', 'from "@/lib/config/ai-timeouts"', 'from "./time-limit"', 'from "@/lib/ai/ai-route"']) {
      expect([...line.matchAll(IMPORTS)].length, line).toBe(1);
    }
  });
});
