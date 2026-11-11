import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES, policyCitationCheckEnabled } from "@/lib/config/chat-quality-flags";

/**
 * Step A, PR 1 (POLICY_CITATION_CHECK_ENABLED): the module is inert. The AI
 * SDK is loaded only by the two call modules, each with `await import`, and
 * no production source outside this folder imports the folder yet.
 */

const CALL_MODULES = ["src/lib/forms/form-patch-call.ts", "src/lib/ai/policy-from-manual/call.ts"];
const FOLDER = "src/lib/ai/policy-from-manual/";
/** Test support (the manual fixture helper) is not production code. */
const TEST_SUPPORT = "src/test/";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

describe("the AI SDK is loaded only by the two call modules, dynamically", () => {
  it("no other production source imports `ai` or `@ai-sdk/anthropic`", () => {
    const needles = ['from "ai"', "from 'ai'", 'import("ai")', "import('ai')", "@ai-sdk/anthropic"];
    const offenders = sources("src").filter((path) => !CALL_MODULES.includes(path) && needles.some((needle) => readFileSync(path, "utf8").includes(needle)));
    expect(offenders).toEqual([]);
  });

  it.each(CALL_MODULES)("%s imports it only with await import", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain('await import("ai")');
    expect(source).toContain('await import("@ai-sdk/anthropic")');
    expect(source).not.toContain('from "ai"');
    expect(source).not.toContain('from "@ai-sdk/anthropic"');
  });
});

describe("nothing imports policy-from-manual yet", () => {
  it("no production source outside the folder imports it", () => {
    const importsIt = (line: string) =>
      line.includes("policy-from-manual") && (line.includes("from \"") || line.includes("from '") || line.includes("import(") || line.includes("require("));
    const offenders = sources("src").filter((path) => !path.startsWith(FOLDER) && !path.startsWith(TEST_SUPPORT) && readFileSync(path, "utf8").split("\n").some(importsIt));
    expect(offenders).toEqual([]);
  });
});

describe("POLICY_CITATION_CHECK_ENABLED", () => {
  const saved = process.env.POLICY_CITATION_CHECK_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.POLICY_CITATION_CHECK_ENABLED;
    else process.env.POLICY_CITATION_CHECK_ENABLED = saved;
  });

  it("is listed, reads off when unset, and on when set", () => {
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("POLICY_CITATION_CHECK_ENABLED");
    delete process.env.POLICY_CITATION_CHECK_ENABLED;
    expect(policyCitationCheckEnabled()).toBe(false);
    process.env.POLICY_CITATION_CHECK_ENABLED = "true";
    expect(policyCitationCheckEnabled()).toBe(true);
  });
});
