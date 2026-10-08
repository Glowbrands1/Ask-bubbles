#!/usr/bin/env node
/**
 * Prepares the reference platform's Performance Management Framework for Ask
 * Bubbles: the app's name removed, everything else verbatim. Reads one file,
 * writes the prepared file and a JSON report beside it. Touches no database
 * and no network; uploading the result is a separate, approved step.
 *
 *   node scripts/knowledge/prepare-performance-framework.mjs <original.txt> <out-dir>
 *
 * Then validate it against the twelve required groups:
 *
 *   PERFORMANCE_FRAMEWORK_PATH=<out-dir>/ASK_BUBBLES_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt \
 *     npx vitest run src/lib/knowledge/performance-management-role.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { prepareFramework } from "./framework-debrand.mjs";

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error("usage: prepare-performance-framework.mjs <original.txt> <out-dir>");
  process.exit(2);
}
const { text, report } = prepareFramework(readFileSync(input, "utf8"));
if (report.appNameLeft !== 0) {
  console.error(`The app's name is still in the text ${report.appNameLeft} time(s); nothing was written.`);
  process.exit(1);
}
if (report.targetNameInSource !== 0 || !report.restoresExactly) {
  console.error("Undoing the app-name changes does not give back the original exactly; nothing was written.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const file = join(outDir, "ASK_BUBBLES_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt");
writeFileSync(file, text);
writeFileSync(join(outDir, "framework-preparation-report.json"), JSON.stringify(report, null, 1));
console.log(`Wrote ${file}: ${report.appNameChanges} app-name changes; flagged for review: ${report.flags.filter((f) => f.count > 0).map((f) => `${f.label} ×${f.count}`).join(", ")}`);
