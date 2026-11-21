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
/* Any import form (from, side-effect import, dynamic import, require, template literal), any path into agent-loop/, with or without an extension. */
const IMPORTS = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]*agent-loop\/[a-z-]+(?:\.[cm]?[jt]sx?)?)["'`]/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

describe("the ported agent-loop files are not imported by today's path", () => {
  it("no file outside src/lib/ai/agent-loop/ imports anything in it", () => {
    const offenders: string[] = [];
    for (const file of files(ROOT)) {
      const path = relative(ROOT, file).split("\\").join("/");
      if (HELPERS.some((helper) => path === helper || path.startsWith(helper))) continue;
      for (const match of readFileSync(file, "utf8").matchAll(IMPORTS)) offenders.push(`${path} → ${match[1]}`);
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
