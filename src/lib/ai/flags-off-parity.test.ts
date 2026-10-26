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
/*
 * The UI files this branch may change. The composer was added with QA's
 * approval on 25 Oct 2026: behind CHAT_LONG_MESSAGE_ENABLED, a
 * character-count line under the field and send disabled over the limit.
 * Off, it renders as before.
 */
const ALLOWED_UI = ["src/features/chat/message-bubble.tsx", "src/features/chat/composer.tsx"];

/*
 * Pau, 26 Oct 2026: asked for the update note on the Google Reviews page. The
 * page may differ from main by exactly these lines: the note's imports and one
 * render guarded by GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED. Anything else in the
 * file fails. Off, it renders as before (src/app/(app)/reviews/page.test.tsx).
 */
const REVIEWS_PAGE = "src/app/(app)/reviews/page.tsx";
const REVIEWS_NOTE_MOUNT = [
  '+import { Notice } from "@/components/ui/feedback";',
  '+import { REVIEWS_UPDATE_NOTE, reviewsUpdateNoteEnabled } from "@/lib/google-reviews/update-note";',
  '+      {reviewsUpdateNoteEnabled() ? <div className="px-5 pt-5 sm:px-6"><Notice tone="attention"><p>{REVIEWS_UPDATE_NOTE}</p></Notice></div> : null}',
];

/*
 * The user (Pau) approved, via QA on 25 Oct 2026, the forms list's Edit and
 * History mount for form revisions in both apps: exactly these two added
 * lines in monitoring-table.tsx, rendering nothing with
 * NEXT_PUBLIC_FORM_REVISIONS_ENABLED off. Any other change to the file fails.
 */
const MONITORING_TABLE = "src/features/forms/monitoring-table.tsx";
const MONITORING_MOUNT = [
  '+import { RegisterRowActions } from "@/form-revisions/register-row-actions";',
  "+                            <RegisterRowActions form={form} />",
];

function changedLines(patch: string): string[] {
  return patch.split("\n").filter((line) => /^[+-](?![+-]{2} )/.test(line));
}

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

  it("does not edit the protected modules, and the only UI diffs are the close-match note and the composer's length line", () => {
    expect(diff("HEAD", [...PROTECTED, ...APPROVED_PROTECTED_EDITS])).toBe("");
    const uiBase = uiDiffBase();
    if (uiBase) {
      const raw = diff(uiBase, [...UI_PATHS, ":(exclude)**/*.test.tsx", ":(exclude)**/*.dom.test.tsx"]);
      const unexpected = raw
        .split(/(?=^diff --git )/m)
        .filter((block) => block.trim().length > 0 && !ALLOWED_UI.some((file) => block.includes(file)) && !block.includes(MONITORING_TABLE) && !block.includes(REVIEWS_PAGE))
        .join("");
      expect(unexpected).toBe("");
      expect(changedLines(diff(uiBase, [MONITORING_TABLE])).filter((line) => !MONITORING_MOUNT.includes(line))).toEqual([]);
      expect(changedLines(diff(uiBase, [REVIEWS_PAGE])).filter((line) => !REVIEWS_NOTE_MOUNT.includes(line))).toEqual([]);
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
        // The child's output (every suite's logs) passed Node's 1 MB default
        // buffer on CI and failed with ENOBUFS before any test failed.
        { env, encoding: "utf8", timeout: 540_000, stdio: "pipe", maxBuffer: 256 * 1024 * 1024 },
      );
      expect(output).toMatch(/Test Files[\s\S]*passed/);
    },
    560_000,
  );
});
