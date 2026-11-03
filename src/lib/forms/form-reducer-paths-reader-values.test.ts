import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { applyPatch, type FormDraft, type PatchRules } from "./form-reducer";

/*
 * QA, 4 Nov 2026 (#410): a correction value the app's own deterministic
 * readers (no model) produced from the manager's words counts as an accepted
 * offer for the reducer's "the value's words were said" check — "$15" →
 * "$15.00", "SD" → "Store Director", "she texted me she quit" → "Text
 * message", "she told me verbally" → "Verbal". The evidence rule is unchanged,
 * and nothing a model wrote benefits.
 */

const FLAGS_ON = { FORM_PATCH_REDUCER_ENABLED: "true", FORM_REPLY_FROM_DIFF_ENABLED: "true", FORM_PATCH_ALL_PATHS_ENABLED: "true" };

/* The six tests that changed with the three flags on (each one a reader-normalised value), run again with them on. */
const FILES = [
  "src/app/api/chat/resign-method-followup-oct25.test.ts",
  "src/lib/forms/chat-correction.test.ts",
  "src/lib/forms/chat-correction-stress.test.ts",
];
const NAMES = [
  "she texted me she quit → Text message",
  "she told me verbally → Verbal",
  "never rewrites 'manager' in ordinary prose when a title named Manager is corrected",
  "two corrections the reader takes together are both saved, with no note",
];

describe("the four wordings, through the real correction path, with the three flags on", () => {
  // Not inside the flags-off parity child run, which forces every flag off.
  it.skipIf(process.env.FLAGS_OFF_PARITY_CHILD === "1")(
    "\"$15\" → \"$15.00\", \"SD\" → \"Store Director\", \"she texted me she quit\" → \"Text message\", \"she told me verbally\" → \"Verbal\" are written",
    () => {
      const env: NodeJS.ProcessEnv = { ...process.env, ...FLAGS_ON };
      delete env.VITEST;
      delete env.VITEST_WORKER_ID;
      delete env.VITEST_POOL_ID;
      let output = "";
      try {
        output = execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...FILES, "-t", NAMES.join("|")], {
          env,
          encoding: "utf8",
          timeout: 300_000,
          stdio: "pipe",
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (error) {
        output = `${(error as { stdout?: string }).stdout ?? ""}${(error as { stderr?: string }).stderr ?? ""}`;
      }
      // Seven: the six that changed with the flags on, and the resign-method reader's own unit test, which shares a name.
      expect(output, output.slice(-4000)).toMatch(/Tests\s+7 passed/);
      expect(output).not.toMatch(/\d+ failed/);
    },
    320_000,
  );
});

/* ------------------------------------------------- the rule, on its own --- */

const RULES: PatchRules = {
  mode: "edit",
  writable: new Set(["resign_method", "new_pay_rate", "job_title"]),
  sources: { manager: "she texted me she quit", managerTurns: ["she texted me she quit"] },
};
const EMPTY: FormDraft = {};
const patch = (key: string, value: string, evidence: string) => ({ set: { [key]: value }, clear: [], how: { [key]: "replace" as const }, evidence: { [key]: evidence } });

describe("reader values count for the value's words, and for nothing else", () => {
  it("before the rule (no reader values): \"Text message\" from \"she texted me she quit\" is refused", () => {
    const { diff } = applyPatch(EMPTY, patch("resign_method", "Text message", "she texted me she quit"), RULES);
    expect(diff.refused).toEqual([{ key: "resign_method", reason: "not_in_manager_words" }]);
  });

  it("with the reader's value: written", () => {
    const rules = { ...RULES, sources: { ...RULES.sources!, readerValues: ["Text message"] } };
    const { diff } = applyPatch(EMPTY, patch("resign_method", "Text message", "she texted me she quit"), rules);
    expect(diff.changed).toEqual([{ key: "resign_method", before: "", after: "Text message" }]);
  });

  it("NEGATIVE: a normalised value the manager never said, and no reader produced, stays refused", () => {
    const rules: PatchRules = {
      ...RULES,
      sources: { manager: "change her new pay rate to $15", managerTurns: ["change her new pay rate to $15"], readerValues: ["$15.00"] },
    };
    const { diff } = applyPatch(EMPTY, patch("new_pay_rate", "$20.00", "change her new pay rate to $15"), rules);
    expect(diff.refused).toEqual([{ key: "new_pay_rate", reason: "not_in_manager_words" }]);
  });

  it("the evidence rule is unchanged: a reader value is never evidence", () => {
    const rules: PatchRules = { ...RULES, sources: { manager: "change her current title to SD", managerTurns: ["change her current title to SD"], readerValues: ["Store Director"] } };
    const { diff } = applyPatch(EMPTY, patch("job_title", "Store Director", "Store Director"), rules);
    expect(diff.refused).toEqual([{ key: "job_title", reason: "not_in_manager_words" }]);
  });

  it("NEGATIVE: a model-written value does not benefit — the patch turn's rules never carry reader values", () => {
    // What `patchActiveForm` builds for the model's patch: no `readerValues`, so the model's "Text message" is refused.
    const { diff } = applyPatch(EMPTY, patch("resign_method", "Text message", "she texted me she quit"), { ...RULES, sources: { ...RULES.sources!, offered: "Got it.", accepted: false } });
    expect(diff.refused).toEqual([{ key: "resign_method", reason: "not_in_manager_words" }]);
    // And no module but the correction's save passes them.
    const allowed = new Set([
      "src/lib/forms/form-reducer.ts",
      "src/lib/forms/form-reducer-paths.ts",
      "src/lib/forms/chat-correction.ts",
      "src/lib/forms/ca-chat-corrections.ts",
    ]);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && readFileSync(path, "utf8").includes("readerValues")) files.push(path.split("\\").join("/"));
      }
    };
    walk("src");
    expect(files.filter((path) => !allowed.has(path))).toEqual([]);
    for (const model of ["src/lib/forms/form-patch-turn.ts", "src/lib/forms/form-reducer-draft.ts", "src/lib/forms/form-patch-model.ts"]) {
      expect(readFileSync(model, "utf8"), model).not.toContain("readerValues");
    }
  });
});
