import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DirectProvisionError, runDirectProvision, type DirectProvisionPlan } from "./direct-provision";

/**
 * DIRECT PROVISIONING AGAINST A REAL SUPABASE AUTH SERVER (disposable local stack).
 *
 *   bash scripts/local-stack/up.sh
 *   set -a; . /tmp/ask-bubbles-local-stack/env; set +a
 *   npx vitest run src/lib/admin/direct-provision.local-stack.test.ts
 *
 * Runs only with ASK_BUBBLES_LOCAL_STACK=1 and refuses any non-127.0.0.1 URL. It
 * drives the SAME `runDirectProvision` the script uses, with real GoTrue and
 * PostgREST, then proves what the new person can and cannot do.
 */
const ENABLED = process.env.ASK_BUBBLES_LOCAL_STACK === "1";
const URL_ = process.env.LOCAL_STACK_URL ?? "";
const ANON = process.env.LOCAL_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SERVICE_ROLE_KEY ?? "";

const run = randomBytes(4).toString("hex");
const opts = { dryRun: false, randomByte: () => randomBytes(1)[0] };
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = () => createClient(URL_, ANON, options);

const plan = (who: string, over: Partial<DirectProvisionPlan> = {}): DirectProvisionPlan => ({
  email: `${who}-${run}@local.test`,
  displayName: who,
  role: "regional_manager",
  scopeLevel: "region",
  areaId: "reg-local-test",
  grantSwitch: true,
  ...over,
});

describe.skipIf(!ENABLED)("direct provisioning on a real Supabase Auth server", { timeout: 60_000 }, () => {
  let admin: SupabaseClient;
  const created: string[] = [];

  beforeAll(() => {
    expect(new URL(URL_).hostname).toBe("127.0.0.1");
    admin = createClient(URL_, SERVICE, options);
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  async function provision(p: DirectProvisionPlan) {
    const result = await runDirectProvision(admin, p, opts);
    if (!("subject" in result)) throw new Error("expected a real run");
    created.push(result.subject);
    return result;
  }

  async function signIn(email: string, password: string) {
    const client = anon();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return { client, session: data.session, error };
  }

  /** The exact read `subjectHasSwitchGrant` makes, as the signed-in user. */
  async function grantRead(client: SupabaseClient, id: string) {
    const { data, error } = await client
      .from("app_users")
      .select("can_switch_apps")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    return error || !data ? false : (data as { can_switch_apps?: unknown }).can_switch_apps === true;
  }

  it("provisions an active, confirmed manager who signs in with the temporary password", async () => {
    const dj = plan("dj");
    const result = await provision(dj);
    const password = result.temporaryPassword!;

    expect(result.profile).toMatchObject({ role: "regional_manager", status: "active", scope_level: "region" });

    const { client, session, error } = await signIn(dj.email, password);
    expect(error).toBeNull();
    expect(session?.user.id).toBe(result.subject);
    expect(session?.user.email_confirmed_at).toBeTruthy();

    // Under RLS the person reads exactly their own, active, granted profile.
    const own = await client.from("app_users").select("id, role, status, scope_level, scope_primary_area_id").eq("id", result.subject);
    expect(own.data).toEqual([
      { id: result.subject, role: "regional_manager", status: "active", scope_level: "region", scope_primary_area_id: "reg-local-test" },
    ]);
    expect(await grantRead(client, result.subject)).toBe(true);
    const everyone = await client.from("app_users").select("id");
    expect(everyone.data).toHaveLength(1);

    // Neither admin nor global.
    expect(own.data![0].role).not.toBe("admin");
    expect(own.data![0].scope_level).not.toBe("global");
  });

  it("lets the signed-in person change the temporary password with no email link, and only the new one works", async () => {
    const colene = plan("colene", { role: "district_manager", scopeLevel: "district", areaId: "dist-local-test" });
    const result = await provision(colene);
    const temporary = result.temporaryPassword!;
    const chosen = `N-${randomBytes(12).toString("hex")}`;

    const { client } = await signIn(colene.email, temporary);
    const changed = await client.auth.updateUser({ password: chosen });
    expect(changed.error).toBeNull();

    expect((await signIn(colene.email, chosen)).error).toBeNull();
    expect((await signIn(colene.email, temporary)).error).not.toBeNull();
  });

  it("gives the person no way to grant, revoke or widen anything through the API", async () => {
    const mgr = plan("selfgrant", { grantSwitch: false });
    const result = await provision(mgr);
    const { client } = await signIn(mgr.email, result.temporaryPassword!);

    expect(await grantRead(client, result.subject)).toBe(false);

    const grant = await client.from("app_users").update({ can_switch_apps: true }).eq("id", result.subject).select();
    const promote = await client.from("app_users").update({ role: "admin" }).eq("id", result.subject).select();
    const widen = await client.from("app_users").update({ scope_level: "global", scope_primary_area_id: null }).eq("id", result.subject).select();
    for (const attempt of [grant, promote, widen]) {
      expect(attempt.error !== null || (attempt.data ?? []).length === 0).toBe(true);
    }

    const row = await admin.from("app_users").select("role, scope_level, can_switch_apps").eq("id", result.subject).single();
    expect(row.data).toEqual({ role: "regional_manager", scope_level: "region", can_switch_apps: false });
  });

  it("an unrelated user never reads a grant, and a revoked or disabled user stops reading one", async () => {
    const a = await provision(plan("revoked"));
    const { client } = await signIn(plan("revoked").email, a.temporaryPassword!);
    expect(await grantRead(client, a.subject)).toBe(true);

    await admin.from("app_users").update({ can_switch_apps: false }).eq("id", a.subject);
    expect(await grantRead(client, a.subject)).toBe(false);

    await admin.from("app_users").update({ can_switch_apps: true }).eq("id", a.subject);
    expect(await grantRead(client, a.subject)).toBe(true);
    await admin.from("app_users").update({ status: "disabled" }).eq("id", a.subject);
    expect(await grantRead(client, a.subject)).toBe(false);
  });

  it("removes the Auth user when the profile insert fails (real cleanup)", async () => {
    // An enum value the database refuses — validation is bypassed on purpose to force the failure.
    const bad = plan("badrole", { role: "not_a_role" as DirectProvisionPlan["role"] });
    await expect(runDirectProvision(admin, bad, opts)).rejects.toMatchObject({ code: "profile_failed" });

    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    expect(listed.data!.users.some((u) => u.email === bad.email)).toBe(false);
    const profile = await admin.from("app_users").select("id").ilike("email", bad.email);
    expect(profile.data).toEqual([]);

    // And it can be re-run cleanly afterwards.
    const ok = await provision({ ...bad, role: "district_manager", scopeLevel: "district", areaId: "dist-local-test" });
    expect(ok.profile.role).toBe("district_manager");
  });

  it("reports an orphan when cleanup cannot delete the Auth user", async () => {
    const failing = new Proxy(admin, {
      get(target, prop, receiver) {
        if (prop === "auth") {
          return { admin: { ...target.auth.admin, createUser: target.auth.admin.createUser.bind(target.auth.admin), listUsers: target.auth.admin.listUsers.bind(target.auth.admin), deleteUser: async () => ({ error: { message: "simulated outage" } }) } };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as SupabaseClient;

    const bad = plan("orphan", { role: "not_a_role" as DirectProvisionPlan["role"] });
    let thrown: unknown;
    try {
      await runDirectProvision(failing, bad, opts);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DirectProvisionError);
    const err = thrown as DirectProvisionError;
    expect(err.code).toBe("cleanup_failed");
    expect(err.orphanedAuthUserId).toBeTruthy();

    // The orphan genuinely exists, as reported — and is removed by hand using the id given.
    const found = await admin.auth.admin.getUserById(err.orphanedAuthUserId!);
    expect(found.data.user?.email).toBe(bad.email);
    await admin.auth.admin.deleteUser(err.orphanedAuthUserId!);
  });

  it("never duplicates: a second run, or a bare auth user, stops without writing", async () => {
    const dup = plan("dup");
    await provision(dup);
    await expect(runDirectProvision(admin, dup, opts)).rejects.toMatchObject({ code: "profile_exists" });

    const bare = plan("bare");
    const made = await admin.auth.admin.createUser({ email: bare.email, password: `B-${randomBytes(9).toString("hex")}`, email_confirm: true });
    created.push(made.data.user!.id);
    await expect(runDirectProvision(admin, bare, opts)).rejects.toMatchObject({ code: "auth_exists" });
    expect((await admin.from("app_users").select("id").ilike("email", bare.email)).data).toEqual([]);

    const count = await admin.from("app_users").select("id").ilike("email", dup.email);
    expect(count.data).toHaveLength(1);
  });
});
