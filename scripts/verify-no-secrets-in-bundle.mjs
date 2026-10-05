#!/usr/bin/env node
/**
 * ============================================================================
 * NO SERVER-ONLY SECRET IN ANY EMITTED CLIENT ASSET
 * ============================================================================
 *
 * Run after `next build`. Walks every `.js`/`.css`/`.html` file under
 * `.next/static` and fails if any of the following appears:
 *
 *   1. the VALUE of any server-only variable set in this process's
 *      environment (the build should be run with canary values — see
 *      `npm run verify:secrets`, which builds with them and then runs this);
 *   2. a credential-shaped string: a Supabase secret key (sb_secret_…), a
 *      service-role JWT, or an Anthropic key (sk-ant-…);
 *   3. code that READS a server-only variable (`process.env.NAME`,
 *      `env["NAME"]`), which would mean a server module was pulled into a
 *      client bundle even if its value happened to be unset. Admin help text
 *      that merely names a variable ("set SUPABASE_SECRET_KEY") is not a read
 *      and is allowed.
 *
 * Only NEXT_PUBLIC_* values may reach the browser, and none of those are
 * secrets.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STATIC = join(process.cwd(), ".next", "static");

const SERVER_ONLY = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "REPORTING_INGEST_SECRET",
  "REPORTING_MANUAL_INGEST_SECRET",
  "WOVEN_SUBSCRIPTION_KEY",
  "WOVEN_USERNAME",
  "WOVEN_PASSWORD",
  "WOVEN_TEAM_USERNAME",
  "WOVEN_TEAM_PASSWORD",
  "WOVEN_VALIDATION_ACCESS_CODE",
];

const SHAPES = [
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { label: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { label: "service-role JWT", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS/ },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|css|html|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

if (!existsSync(STATIC)) {
  console.error("No .next/static — run `next build` first.");
  process.exit(1);
}

const values = SERVER_ONLY.map((name) => [name, (process.env[name] ?? "").trim()]).filter(
  ([, value]) => value.length >= 8,
);
const files = walk(STATIC);
const leaks = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const [name, value] of values) {
    if (source.includes(value)) leaks.push(`${file}: the value of ${name}`);
  }
  for (const name of SERVER_ONLY) {
    const read = new RegExp(`(process\\.env\\.${name}\\b|env\\[["'\`]${name}["'\`]\\])`);
    if (read.test(source)) leaks.push(`${file}: code reading ${name}`);
  }
  for (const { label, pattern } of SHAPES) {
    if (pattern.test(source)) leaks.push(`${file}: a ${label}`);
  }
}

console.log(`Scanned ${files.length} emitted client files; ${values.length} server-only values were set to check.`);
if (leaks.length > 0) {
  console.error("FAIL: server-only material in client assets:");
  for (const leak of leaks) console.error(`  ${leak}`);
  process.exit(1);
}
console.log("OK: no server-only secret, secret name or credential-shaped string in any client asset.");
