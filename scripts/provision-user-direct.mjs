#!/usr/bin/env node
/**
 * ============================================================================
 * PROVISION ONE NON-ADMINISTRATOR DIRECTLY, WITHOUT AN EMAIL LINK.
 * ============================================================================
 *
 * For when invitation links cannot be used. Creates the Supabase Auth user with
 * the Admin API (email pre-confirmed, a temporary password) AND the matching
 * `app_users` profile in one operation, so the person can sign in at /login and
 * then change the password at /reset-password.
 *
 *   # Dry run (default): validates everything, reads the project, changes nothing.
 *   node scripts/provision-user-direct.mjs \
 *     --email person@company.com --name "Full Name" \
 *     --role regional_manager --scope-level region --area-id reg-xyz \
 *     --grant-switch
 *
 *   # Real run: add --apply and name the project host you mean to write to.
 *   ... --apply --confirm-host abcd1234.supabase.co
 *
 * Environment (this command only; never commit the key):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * GUARDS
 *   - Refuses administrative roles and global scope; refuses an area id the
 *     roster does not know (see src/lib/admin/direct-provision.ts). No
 *     placeholder ids.
 *   - Never duplicates: stops if a profile OR an auth user already exists for
 *     the address, and changes nothing.
 *   - --apply needs --confirm-host to equal the project host, so a pasted URL for
 *     the wrong project fails instead of writing.
 *   - If the profile insert fails the auth user is deleted again (no orphan).
 *   - The temporary password is printed ONCE, to an interactive terminal only,
 *     and never written to a file or a log. Hand it over out-of-band (in
 *     person / password manager). The person should change it on first sign-in.
 *   - Writes an `app_user_audit` row (action `invited`, actor "direct-provision
 *     script"). The profile is created `active` because the credential is
 *     already confirmed; this skips `accept_invitation` on purpose.
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  generateTemporaryPassword,
  validateDirectProvision,
} from "../src/lib/admin/direct-provision.ts";
import {
  COMPANY_DISTRICT_ENTRIES,
  COMPANY_LOCATION_ENTRIES,
  COMPANY_REGION_ENTRIES,
} from "../src/config/company/locations.ts";

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? "");
}
const has = (name) => process.argv.includes(`--${name}`);

const roster = {
  locationIds: COMPANY_LOCATION_ENTRIES.map((entry) => `loc-${entry.code}`),
  districtIds: COMPANY_DISTRICT_ENTRIES.map((entry) => entry.id),
  regionIds: COMPANY_REGION_ENTRIES.map((entry) => entry.id),
};

const checked = validateDirectProvision(
  {
    email: flag("email") ?? "",
    displayName: flag("name") ?? "",
    role: flag("role") ?? "",
    scopeLevel: flag("scope-level") ?? "",
    areaId: flag("area-id") ?? "",
    grantSwitch: has("grant-switch"),
  },
  roster,
);
if (!checked.ok) fail(checked.problems.map((p) => `• ${p}`).join("\n"));
const plan = checked.plan;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret =
  process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !secret) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for this command.");
if (secret.startsWith("sb_publishable_")) fail("That is a PUBLISHABLE key; the secret key is required.");
const host = new URL(url).host;

const apply = has("apply");
if (apply && flag("confirm-host") !== host) {
  fail(`--apply requires --confirm-host ${host} (the project this URL points at).`);
}
if (apply && !process.stdout.isTTY) {
  fail("--apply must run in an interactive terminal: the temporary password is shown once and must not land in a log.");
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

console.log(`\nAsk Bubbles — direct provisioning (${apply ? "APPLY" : "dry run"})`);
console.log(`  project : ${host}`);
console.log(`  person  : ${plan.displayName} <${plan.email}>`);
console.log(`  role    : ${plan.role}`);
console.log(`  scope   : ${plan.scopeLevel} ${plan.areaId}`);
console.log(`  switcher: ${plan.grantSwitch ? "can_switch_apps = true" : "not granted"}\n`);

// 1. No duplicate profile.
const profile = await admin.from("app_users").select("id, role, status").ilike("email", plan.email).maybeSingle();
if (profile.error) fail(`Could not read app_users: ${profile.error.message}`);
if (profile.data) fail(`A profile already exists for ${plan.email} (${profile.data.role}, ${profile.data.status}). Nothing changed.`);

// 2. No duplicate credential.
let page = 1;
for (;;) {
  const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (listed.error) fail(`Could not list auth users: ${listed.error.message}`);
  if (listed.data.users.some((u) => u.email?.toLowerCase() === plan.email)) {
    fail(`An auth account already exists for ${plan.email} with no profile. Resolve it deliberately (nothing was changed); this script will not adopt or duplicate it.`);
  }
  if (listed.data.users.length < 200) break;
  page += 1;
}

if (plan.grantSwitch) {
  const column = await admin.from("app_users").select("can_switch_apps").limit(1);
  if (column.error) fail("app_users.can_switch_apps is missing. Apply migration 20261013002000_app_switcher_grant.sql first.");
}

if (!apply) {
  console.log("✓ Dry run passed. No account exists for this address and the inputs are valid.");
  console.log("  Nothing was created. Re-run with --apply --confirm-host " + host + " to create it.\n");
  process.exit(0);
}

// 3. Create the credential, then the profile.
const password = generateTemporaryPassword(() => randomBytes(1)[0]);
const made = await admin.auth.admin.createUser({ email: plan.email, password, email_confirm: true });
if (made.error || !made.data?.user) fail(`Supabase refused to create the account: ${made.error?.message ?? "no user returned"}`);
const subject = made.data.user.id;

const inserted = await admin
  .from("app_users")
  .insert({
    id: subject,
    email: plan.email,
    display_name: plan.displayName,
    role: plan.role,
    status: "active",
    scope_level: plan.scopeLevel,
    scope_primary_area_id: plan.areaId,
    scope_also_covers_area_ids: [],
    ...(plan.grantSwitch ? { can_switch_apps: true } : {}),
  })
  .select("id, email, role, status, scope_level, scope_primary_area_id")
  .single();

if (inserted.error) {
  await admin.auth.admin.deleteUser(subject).catch(() => {});
  fail(`The profile could not be created, so the auth account was removed again: ${inserted.error.message}`);
}

await admin.from("app_user_audit").insert({
  target_user_id: subject,
  target_email: plan.email,
  actor_user_id: null,
  actor_email: "direct-provision script",
  action: "invited",
  to_value: plan.role,
});

console.log("✓ Created.");
console.log(`    profile : ${inserted.data.id}`);
console.log(`    role    : ${inserted.data.role} (${inserted.data.status})`);
console.log(`    scope   : ${inserted.data.scope_level} ${inserted.data.scope_primary_area_id}`);
console.log(`\n  Temporary password (shown once — hand it over out-of-band, then clear this terminal):\n\n    ${password}\n`);
console.log("  First sign-in: /login, then change it at /reset-password before doing anything else.\n");
