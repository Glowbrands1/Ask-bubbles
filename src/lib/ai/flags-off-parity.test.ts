import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES, antiLoopEnabled, envFlag } from "@/lib/config/chat-quality-flags";

/**
 * Flags off must match the path the suites already expect.
 *
 * Every name in CHAT_QUALITY_FLAG_NAMES defaults off, including
 * ANTI_LOOP_ENABLED. The chat and form suites run again in a child
 * process with each of those names forced off. A failure there is a
 * behavior change that leaked through while the flags were off.
 *
 * The close-match note under the form card is the one UI file this
 * branch changes. It renders nothing unless the proposal sets the note.
 */

const PROTECTED = [
  "src/lib/ai/form-proposal.ts",
  "src/lib/ai/violation-policy.ts",
  "src/lib/ai/prior-coaching-optional.ts",
  "src/lib/ai/glossary.ts",
  "src/lib/ai/form-field-state.ts",
  "src/lib/ai/chat-data-plan.ts",
  "src/lib/forms/location-scope.ts",
  "src/lib/forms/proposal.ts",
  "src/lib/forms/form-date-answer.ts",
  "src/lib/forms/payroll-deduct.ts",
  "src/lib/forms/ca-action-plan.ts",
  "src/lib/forms/required-closing.ts",
  "src/lib/forms/chat-revision.ts",
  "src/lib/forms/revision.ts",
  "src/lib/forms/policy-citation.ts",
  "src/lib/forms/instances.ts",
];

/*
 * The user (Pau) approved, via QA on 25 Oct 2026, editing
 * src/lib/forms/form-date-answer.ts to fix prior-action parsing behind
 * PRIOR_ACTIONS_PARSE_ENABLED, with the flag-off reading unchanged. It stays
 * on the PROTECTED list; only the diff check leaves it out. No other
 * protected file is excepted.
 */
const APPROVED_PROTECTED_EDITS = [":(exclude)src/lib/forms/form-date-answer.ts"];

const UI_PATHS = ["src/app/**/*.tsx", "src/components/**", "src/features/**/*.tsx", "**/*.css"];
const ALLOWED_UI = "src/features/chat/message-bubble.tsx";

function diff(ref: string, args: string[]): string {
  return execFileSync("git", ["diff", ref, "--", ...args], { encoding: "utf8" });
}

function hasRef(ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function uiDiffBase(): string | null {
  if (hasRef("origin/main")) return "origin/main";
  if (!hasRef("main")) return null;
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", "main"], { encoding: "utf8", stdio: "pipe" }).trim();
    return base || null;
  } catch {
    return null;
  }
}

describe("new flags default off", () => {
  it("treats unset flags as off, including the anti-loop flag", () => {
    const previous = Object.fromEntries(CHAT_QUALITY_FLAG_NAMES.map((name) => [name, process.env[name]]));
    for (const name of CHAT_QUALITY_FLAG_NAMES) delete process.env[name];
    for (const name of CHAT_QUALITY_FLAG_NAMES) expect(envFlag(name)).toBe(false);
    expect(antiLoopEnabled()).toBe(false);
    for (const name of CHAT_QUALITY_FLAG_NAMES) {
      const saved = previous[name];
      if (saved === undefined) delete process.env[name];
      else process.env[name] = saved;
    }
  });

  it("does not edit the protected modules, and the only UI diff is the close-match note", () => {
    expect(diff("HEAD", [...PROTECTED, ...APPROVED_PROTECTED_EDITS])).toBe("");
    const uiBase = uiDiffBase();
    if (uiBase) {
      const raw = diff(uiBase, [...UI_PATHS, ":(exclude)**/*.test.tsx", ":(exclude)**/*.dom.test.tsx"]);
      const unexpected = raw
        .split(/(?=^diff --git )/m)
        .filter((block) => block.trim().length > 0 && !block.includes(ALLOWED_UI))
        .join("");
      expect(unexpected).toBe("");
    }
    const ask = readFileSync("src/lib/ai/server-ask.ts", "utf8");
    const code = ask.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("process.env");
    expect(code).not.toContain(".catch(");
    expect(ask).toContain("question: request.question");
    expect(ask).toContain("slotRetentionEnabled()");
  }, 60_000);
});

const CHILD = process.env.FLAGS_OFF_PARITY_CHILD === "1";

describe("existing chat and form suites with every new flag off", () => {
  it.skipIf(CHILD)(
    "passes the suites whose expectations are already on main",
    () => {
      const env: NodeJS.ProcessEnv = { ...process.env, FLAGS_OFF_PARITY_CHILD: "1" };
      delete env.VITEST;
      delete env.VITEST_WORKER_ID;
      delete env.VITEST_POOL_ID;
      for (const name of CHAT_QUALITY_FLAG_NAMES) env[name] = "off";
      const output = execFileSync(
        process.execPath,
        [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--exclude",
          "src/lib/ai/flags-off-parity.test.ts",
          "src/lib/ai",
          "src/lib/forms",
          "src/app/api/chat",
          "src/app/api/forms",
        ],
        { env, encoding: "utf8", timeout: 540_000, stdio: "pipe" },
      );
      expect(output).toMatch(/Test Files[\s\S]*passed/);
    },
    560_000,
  );
});
