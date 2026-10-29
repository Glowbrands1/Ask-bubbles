import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES, antiLoopEnabled, envFlag } from "@/lib/config/chat-quality-flags";
import { cardChangeEnabled, cardChangeFinalizedEnabled } from "@/lib/forms/card-change-flag";

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
 * on the PROTECTED list; only the diff check leaves it out.
 *
 * The user (Pau) approved, on 26 Oct 2026, editing src/lib/ai/form-proposal.ts
 * for STORED_SLOTS_NOT_A_REQUEST_ENABLED: in turnsAboutThisForm the new-request
 * check reads the manager's words, not the app's stored-slot lines, with the
 * flag-off reading unchanged. It stays on the PROTECTED list; only the diff
 * check leaves it out. No other protected file is excepted.
 * PRIOR_ACTIONS_PARSE_ENABLED, with the flag-off reading unchanged, and on
 * 26 Oct 2026 again for the incident date behind PRIOR_SENTENCE_FIX_ENABLED
 * (a prior step's date is never the form's Date). It stays
 * on the PROTECTED list; only the diff check leaves it out. No other
 * protected file is excepted.
 *
 * The user (Pau) approved, in the Code session on 27 Oct 2026 ("yes, name
 * question form-proposal.ts both apps"), two lines in src/lib/ai/form-proposal.ts
 * openingQuestions behind NAME_QUESTION_ONLY_ENABLED: with no employee named,
 * one plain question instead of the list. Off, the list as before.
 *
 * The user (Pau) approved, in the Code session on 27 Oct 2026, editing
 * src/lib/forms/proposal.ts, only two lines, for the Madeline chain (QA BF7):
 * the import of `namesSomebody` from "./answer-not-a-name", and in
 * readEmployeeMentions `settle(strong.filter(namesSomebody),
 * found.filter(namesSomebody), text, subjects)`. Behind
 * ANSWER_NOT_A_NAME_ENABLED and STORE_WORD_NOT_A_NAME_ENABLED, both default
 * off; off, namesSomebody keeps every candidate. It stays on the PROTECTED
 * list; only the diff check leaves it out.
 *
 * The user (Pau) approved, in the Code session on 27 Oct 2026, editing
 * src/lib/forms/form-date-answer.ts in both apps, only two lines: the import
 * of `withWiderDates` from "./wider-dates", and datesInText's last line
 * `return withWiderDates(text ?? "", today, found);`. Behind
 * WIDER_DATE_READER_ENABLED, default off; off, the dates found are returned
 * as they were. form-date-answer.ts is already excluded from the diff check.
 */
const APPROVED_PROTECTED_EDITS = [
  ":(exclude)src/lib/forms/form-date-answer.ts",
  ":(exclude)src/lib/ai/form-proposal.ts",
  ":(exclude)src/lib/forms/proposal.ts",
];

const UI_PATHS = ["src/app/**/*.tsx", "src/components/**", "src/features/**/*.tsx", "**/*.css"];
/*
 * The UI files this branch may change. The composer was added with QA's
 * approval on 25 Oct 2026: behind CHAT_LONG_MESSAGE_ENABLED, a
 * character-count line under the field and send disabled over the limit.
 * Off, it renders as before.
 */
/*
 * And the Forms Register links an Assistant Manager would meet (chat card
 * button, search and its hook): QA approved on 27 Oct 2026, behind
 * NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED. Each gate reads the flag first;
 * off, it renders as before for every role.
 */
const ALLOWED_UI = [
  "src/features/chat/message-bubble.tsx",
  "src/features/chat/composer.tsx",
  "src/features/chat/inline-form.tsx",
  "src/components/shell/global-search.tsx",
  "src/components/shell/hides-form-monitoring.ts",
  // PRIVATE_CREATOR_FORMS_ENABLED (QA approved 27 Oct 2026): the follow-up and list reads over-read and trim to
  // their page while the rule is active; off, each asks for its page exactly as before.
  "src/app/(app)/page.tsx",
  "src/app/(app)/layout.tsx",
  "src/app/(app)/forms/monitoring/page.tsx",
  // QA-approved 2026-10-27 (owner asked for the Change something button), behind
  // NEXT_PUBLIC_CARD_CHANGE_ENABLED; off, it renders nothing.
  "src/features/chat/card-change-panel.tsx",
  // QA-approved 2026-10-28 (Pau: structured changes on a finalized form), behind
  // NEXT_PUBLIC_CARD_CHANGE_FINALIZED_ENABLED; off, it renders nothing.
  "src/features/chat/finalized-change-panel.tsx",
  // INVITE_LINK_HOLD_ENABLED (QA approved 28 Oct 2026, both apps): the new invitation
  // Continue page and its form. Off, the page never shows Continue.
  "src/app/auth/invite-continue/page.tsx",
  "src/features/auth/invite-continue-form.tsx",
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
  /*
   * Pau approved, via QA on 29 Oct 2026, both apps, no flag: the row menu
   * "…" shows only when it has an item. A role that may track but not manage
   * got an empty menu on a row that is not followed up ("wanted to delete
   * some form but the ... is not showing when clicked").
   */
  "-                            {mayManage || mayTrack ? (",
  "+                            {mayManage || (form.followedUpAt && mayTrack) ? (",
];

/*
 * NEXT_PUBLIC_INVITED_SIGNIN_ACCEPTS_ENABLED (QA approved 28 Oct 2026, both
 * apps; QA reviews the auth diff line by line): sign-in-form.tsx may add
 * exactly the flag import and the gated accept call, plus comment lines.
 * Off, the form behaves as before. Any other change to the file fails.
 */
const SIGN_IN_FORM = "src/features/auth/sign-in-form.tsx";
const SIGN_IN_ACCEPT = [
  '+import { invitedSignInAcceptsEnabled } from "@/lib/auth/invited-signin-flag";',
  "+      if (invitedSignInAcceptsEnabled()) {",
  '+        await fetch("/api/auth/accept-invitation", { method: "POST" }).catch(() => undefined);',
  "+      }",
];
const isAddedCommentOrBlank = (line: string) => /^\+\s*(\/\*.*|\*.*|)$/.test(line);

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
    expect(cardChangeEnabled()).toBe(false);
    expect(cardChangeFinalizedEnabled()).toBe(false);
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
        .filter((block) => block.trim().length > 0 && !ALLOWED_UI.some((file) => block.includes(file)) && !block.includes(MONITORING_TABLE) && !block.includes(SIGN_IN_FORM))
        .join("");
      expect(unexpected).toBe("");
      expect(changedLines(diff(uiBase, [MONITORING_TABLE])).filter((line) => !MONITORING_MOUNT.includes(line))).toEqual([]);
      expect(
        changedLines(diff(uiBase, [SIGN_IN_FORM])).filter((line) => !SIGN_IN_ACCEPT.includes(line) && !isAddedCommentOrBlank(line)),
      ).toEqual([]);
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
