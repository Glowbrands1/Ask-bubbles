import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * The agent-loop files ported from the sibling app ahead of the loop (loop port, Phase 2: switch.ts) are UNUSED in this
 * app until the loop itself is ported. Nothing outside src/lib/ai/agent-loop/ may import them, so today's chat path
 * behaves exactly as before. (From #935, narrowed: the time limits are wired into the chat on purpose by their own PR.)
 */
const ROOT = join(process.cwd(), "src");
const HELPERS = ["lib/ai/agent-loop/"];
/*
 * Changed on purpose (21 Nov 2026, the loop port's Phase 3+4; QA2: "the create/draft/client hooks, all behind
 * AGENT_LOOP_ENABLED + AGENT_LOOP_USERS"): the loop is now wired in, so the guard names the reviewed importers instead of
 * none. The chat route reaches the loop only inside its `agentLoopFor(...)` branch (run.ts by `await import()`, checked in
 * src/lib/forms/form-patch-flags-off.test.ts); Create reads the loop's card record only for a card that carries
 * `fromAgentLoop`; the company config and the follow-up write read the app config (plain data). Any other importer fails.
 */
const REVIEWED = new Set([
  "app/api/chat/route.ts → @/lib/ai/agent-loop/switch",
  "app/api/chat/route.ts → @/lib/ai/agent-loop/run",
  "app/api/chat/route.ts → @/lib/ai/agent-loop/turn-category",
  "app/api/forms/instances/route.ts → @/lib/ai/agent-loop/settled-names",
  "config/company/agent-loop.ts → @/lib/ai/agent-loop/app-config",
  "lib/forms/follow-up-default-write.ts → @/lib/ai/agent-loop/app-config",
]);
/* Test code: test files, and the replay pack (its stand-in model and cases read the loop, as in the sibling app). */
const isTest = (path: string) => /\.test\.tsx?$/.test(path) || path.startsWith("app/api/chat/replay-pack/");
/* Any import form (from, side-effect import, dynamic import, require, template literal), any path into agent-loop/, with or without an extension. */
const IMPORTS = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]*agent-loop\/[a-z-]+(?:\.[cm]?[jt]sx?)?)["'`]/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

describe("the ported agent-loop files are imported only by the reviewed hooks", () => {
  it("no file outside src/lib/ai/agent-loop/ imports anything in it, except the reviewed hooks", () => {
    const offenders: string[] = [];
    for (const file of files(ROOT)) {
      const path = relative(ROOT, file).split("\\").join("/");
      if (HELPERS.some((helper) => path === helper || path.startsWith(helper)) || isTest(path)) continue;
      for (const match of readFileSync(file, "utf8").matchAll(IMPORTS)) {
        const edge = `${path} → ${match[1]}`;
        if (!REVIEWED.has(edge)) offenders.push(edge);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the pattern catches each import form (self-check)", () => {
    for (const line of [
      'import { x } from "@/lib/ai/agent-loop/switch";',
      'await import("../agent-loop/run")',
      // QA's review of #935: a side-effect import, extensions, template literals, require.
      'import "@/lib/ai/agent-loop/switch";',
      'from "./agent-loop/dates.js"',
      'from "@/lib/ai/agent-loop/switch.ts"',
      'await import(`@/lib/ai/agent-loop/switch`)',
      'require("../ai/agent-loop/switch")',
    ]) {
      expect([...line.matchAll(IMPORTS)].length, line).toBe(1);
    }
    // A name that only contains a helper's name is not that helper.
    for (const line of ['from "./my-agent-loop-notes"', 'from "@/lib/ai/agent-loop-switch"']) {
      expect([...line.matchAll(IMPORTS)].length, line).toBe(0);
    }
  });
});
