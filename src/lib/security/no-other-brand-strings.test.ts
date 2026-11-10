import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * NO SIBLING-BRAND WORDING IN THIS APP'S STRINGS
 * ============================================================================
 *
 * QA (10 Nov 2026): never copy the sibling company's content into this app. Every string literal, template text and
 * JSX text under `src/` (tests, test support and the replay pack aside) is read with the TypeScript parser — comments
 * and regular expressions are not strings — and none may name the sibling company or its products: "Sun Tan City",
 * "STC", "tanning", "spray tan", "Sunny". "MyGlow" and "Sunlync" only from `config/company/forms/exit-systems.ts`, where
 * Pau's 25 Oct 2026 ruling (via QA) put them: Buff City Soap uses both systems. "Salon" is allowed: the readers must
 * understand a manager who types it.
 *
 * The files below may name them, each for the reason given. A new hit anywhere else fails: move the wording to this
 * app's own, or add the file here with its reason.
 */
const BANNED = /sun\s?tan\s?city|\bstc\b|\btanning\b|spray\s?tan|\bsunny\b|myglow|sunlync/i;

const ALLOWED: Readonly<Record<string, string>> = {
  "src/components/shell/app-switcher.tsx": "the switcher's link to the sibling app names it",
  "src/config/company/app-links.ts": "the sibling app's address",
  "src/config/company/forms/exit-systems.ts": "MyGlow and Sunlync — Buff City Soap uses both (Pau, via QA, 25 Oct 2026)",
  "src/config/company/forms/hidden.ts": "the keys of the sibling's forms this app hides",
  "src/config/company/google-reviews.ts": "markers that filter the sibling's reviews out",
  "src/config/company/knowledge.ts": "the shared manual's sibling-only sections, so they are skipped",
  "src/form-revisions/edit-permission.ts": "a hidden sibling form's name, so its edits are refused",
  "src/lib/ai/employee-performance-gate.ts": "the sibling's brand marker, so its rows are filtered",
  "src/lib/ai/full-manual-context.ts": "the shared manual's sibling-only parts, so they are skipped",
  "src/lib/forms/chooser.ts": "a hidden sibling form's key, so the chooser withholds it",
  "src/lib/forms/hiring-library.ts": "the sibling's interview forms, seeded hidden (config/company/forms/hidden.ts)",
  "src/lib/forms/template-intent.ts": "readers: a manager may type the sibling's job titles or form names",
};

const SKIP_DIR = /(?:^|\/)(?:node_modules|replay-pack|__tests__|test)(?:\/|$)/;
const SKIP_FILE = /\.test\.tsx?$|test-support\.ts$|\.d\.ts$/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(path)) out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !SKIP_FILE.test(entry.name)) out.push(path);
  }
  return out;
}

function stringsIn(file: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    const text =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)
        ? node.text
        : null;
    const inRegExp = node.parent && ts.isNewExpression(node.parent) && node.parent.expression.getText(source) === "RegExp";
    if (text && !inRegExp) found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("no sibling-brand wording in this app's strings", () => {
  it("names the sibling company and its products only where a file is allowed to", () => {
    const hits = sourceFiles("src")
      .filter((file) => !ALLOWED[file])
      .flatMap((file) => stringsIn(file).filter(({ text }) => BANNED.test(text)).map(({ line, text }) => `${file}:${line}: ${JSON.stringify(text.slice(0, 100))}`));
    expect(hits).toEqual([]);
  });

  it("every allowed file still needs its place on the list", () => {
    const stale = Object.keys(ALLOWED).filter((file) => {
      try {
        return !stringsIn(file).some(({ text }) => BANNED.test(text));
      } catch {
        return true;
      }
    });
    expect(stale).toEqual([]);
  });
});
