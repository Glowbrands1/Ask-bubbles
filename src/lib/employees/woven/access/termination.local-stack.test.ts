import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APP_SWITCHER_USER_IDS } from "@/lib/auth/app-switcher-users";

/**
 * ============================================================================
 * TERMINATION ENFORCEMENT AND REHIRE, END TO END ON REAL SUPABASE AUTH + POSTGRES
 * ============================================================================
 *
 * Runs only on the disposable local stack (`npm run stack:up`, then
 * `npm run test:local-stack`, which exports `ASK_BUBBLES_LOCAL_STACK=1`). Every
 * URL and key comes from the local env file and the suite refuses a URL that is
 * not 127.0.0.1. Never against a Supabase project.
 *
 * It drives the PR's real code: the planner, the shadow recorder, the review,
 * `runTerminationEnforcement` / `enforceTerminations`, `revokeAuthAccess`,
 * `runRehireApproval` / `approveRehire`, `restoreAuthAccess`, `patchUser`, and
 * the migration's SQL functions — against GoTrue v2.180, PostgREST and Postgres
 * with every migration applied (including 20261019001000).
 *
 * The scenarios run in order and share state, like the stack's other suites.
 */

const ENABLED = process.env.ASK_BUBBLES_LOCAL_STACK === "1";
const URL_ = process.env.LOCAL_STACK_URL ?? "";
const ANON = process.env.LOCAL_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SERVICE_ROLE_KEY ?? "";
const PG = process.env.LOCAL_STACK_PG ?? "";

const COMPANY = "55839f24-9241-418c-8405-37baf9a42a87";
const FOREIGN_COMPANY = "1ba00000-0000-4000-8000-0000000000aa";
const run = randomBytes(3).toString("hex");
const emp = (name: string) => `T54-${run}-${name}`;
const pw = () => `P-${randomBytes(12).toString("hex")}`;

const sql = (query: string) => execFileSync("psql", [PG, "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
const anonClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

async function cookieHeaderFor(session: Session): Promise<string> {
  const jar = new Map<string, string>();
  const client = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (entries) => entries.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

interface Person {
  id: string;
  email: string;
  password: string;
  employeeId: string;
  sessions: Session[];
  cookies: string[];
}

describe.skipIf(!ENABLED)("termination enforcement and rehire on a real Supabase Auth server (local stack)", { timeout: 120_000 }, () => {
  let admin: SupabaseClient;
  const people: Record<string, Person> = {};
  let reviewerId = "";
  let managerId = "";
  let recoveryHash = "";
  const savedEnv: Record<string, string | undefined> = {};
  /** The stack's other suites leave directory rows behind; their statuses are parked for this suite and restored after. */
  let parked: { id: string; status: string }[] = [];
  const touchedEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "WOVEN_ACCESS_MODE", "WOVEN_TERMINATION_ENFORCEMENT", "NEXT_PUBLIC_DEMO_MODE"];

  const authorize = async (cookie: string) => {
    const { authorizeRequest } = await import("@/lib/auth/server");
    return authorizeRequest(new Request("http://127.0.0.1:3000/api/x", { headers: { cookie } }), "ask_questions");
  };
  const signIn = (p: Person) => anonClient().auth.signInWithPassword({ email: p.email, password: p.password });
  const setStatus = (key: string, status: string) =>
    sql(`update public.employee_access_directory set employment_status = '${status}' where external_employee_id = '${people[key]!.employeeId}'`);
  /** A fresh, successful, pinned-company directory sync: the "latest read" is current. */
  const freshSync = () =>
    sql(`insert into public.employee_sync_runs (requested_by, source_mode, status, employees_active, finished_at) values ('cron', 'scheduled_poll', 'succeeded', 50, now())`);
  const applyRuns = () => Number(sql(`select count(*) from public.employee_access_runs where mode = 'apply'`));
  const lastApplyRun = () => sql(`select status from public.employee_access_runs where mode = 'apply' order by created_at desc, id desc limit 1`);
  const auditActions = (key: string) =>
    sql(`select coalesce(string_agg(action, ',' order by created_at, action), '') from public.app_user_audit where target_user_id = '${people[key]!.id}'`);
  const link = (key: string) =>
    sql(`select coalesce(terminated_at is not null, false)::text || ',' || coalesce(access_revoked_at is not null, false)::text || ',' || coalesce(reactivated_at is not null, false)::text from public.employee_account_links where app_user_id = '${people[key]!.id}'`);
  const profile = (key: string) => sql(`select status from public.app_users where id = '${people[key]!.id}'`);
  const banned = (key: string) => sql(`select coalesce(banned_until > now(), false)::text from auth.users where id = '${people[key]!.id}'`);
  const sessionCount = (key: string) => Number(sql(`select count(*) from auth.sessions where user_id = '${people[key]!.id}'`));

  async function withForeignCompany(key: string, body: () => Promise<void>) {
    sql(`alter table public.employee_access_directory drop constraint employee_access_directory_pinned_company`);
    sql(`update public.employee_access_directory set woven_company_id = '${FOREIGN_COMPANY}' where external_employee_id = '${people[key]!.employeeId}'`);
    try {
      await body();
    } finally {
      sql(`update public.employee_access_directory set woven_company_id = '${COMPANY}' where external_employee_id = '${people[key]!.employeeId}'`);
      sql(`alter table public.employee_access_directory add constraint employee_access_directory_pinned_company check (woven_company_id = '${COMPANY}'::uuid)`);
    }
  }

  /** Records a shadow run (the real recorder), reviews exactly `keys` as the administrator, returns the run id. */
  async function shadowAndReview(keys: string[]) {
    freshSync();
    const { recordAccessShadowRun } = await import("./shadow");
    const recorded = await recordAccessShadowRun("cron");
    expect(recorded).toMatchObject({ status: "recorded", aborted: false });
    const { loadShadowReviewCandidates, runShadowReview } = await import("./shadow-review-run");
    const candidates = await loadShadowReviewCandidates();
    const ids = keys.map((k) => people[k]!.employeeId);
    for (const id of ids) expect(candidates.employeeIds).toContain(id);
    const outcome = await runShadowReview({ shadowRunId: candidates.shadowRunId!, employeeIds: ids, reason: "checked against HR" }, reviewerId);
    return { candidates, outcome };
  }

  beforeAll(async () => {
    expect(new URL(URL_).hostname).toBe("127.0.0.1");
    for (const k of touchedEnv) savedEnv[k] = process.env[k];
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON;
    process.env.SUPABASE_SECRET_KEY = SERVICE;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;

    admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

    /*
     * The mass-change guards look at the WHOLE plan. Rows other suites left behind (location moves, creates)
     * would trip them and hide what this suite proves, so park them as `unknown` (planned as
     * FLAG_UNKNOWN_STATUS: no move, no create) and restore them in afterAll.
     */
    parked = sql(`select external_employee_id || '|' || employment_status from public.employee_access_directory where external_employee_id not like 'T54-%' and employment_status <> 'unknown'`)
      .split("\n")
      .filter(Boolean)
      .map((line) => ({ id: line.split("|")[0]!, status: line.split("|")[1]! }));
    sql(`update public.employee_access_directory set employment_status = 'unknown' where external_employee_id not like 'T54-%'`);

    /* The app-switcher accounts have FIXED ids: clear any earlier run's copy of that id on this disposable stack. */
    const fixed = APP_SWITCHER_USER_IDS[0]!;
    sql(`delete from public.app_user_audit where target_user_id = '${fixed}'`);
    sql(`delete from public.employee_account_links where app_user_id = '${fixed}'`);
    sql(`delete from auth.users where id = '${fixed}'`);

    const make = async (key: string, role: string, opts: { id?: string; linked?: boolean; status?: string; scope?: "location" | "global"; password?: boolean } = {}) => {
      const email = `${key}-${run}@local.test`;
      const password = pw();
      const { data, error } = await admin.auth.admin.createUser({ ...(opts.id ? { id: opts.id } : {}), email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser ${key}: ${error?.message}`);
      const id = data.user.id;
      const scope = opts.scope ?? (role === "location_manager" || role === "employee" ? "location" : "global");
      const { error: profileError } = await admin.from("app_users").insert({
        id, email, display_name: key, role, status: "active", scope_level: scope,
        scope_primary_area_id: scope === "location" ? "loc-0307" : null, scope_also_covers_area_ids: [],
      });
      if (profileError) throw new Error(`profile ${key}: ${profileError.message}`);
      const employeeId = emp(key);
      if (opts.linked) {
        sql(`insert into public.employee_access_directory (source_system, external_employee_id, email_address, employment_status, record_hash, first_name, last_name, woven_company_id)
             values ('woven', '${employeeId}', 'woven-${key}-${run}@gmail.test', '${opts.status ?? "terminated"}', '${"0".repeat(64)}', 'Pat', '${key}', '${COMPANY}')`);
        sql(`insert into public.employee_account_links (app_user_id, management, external_employee_id, link_method, managed_status, set_by)
             values ('${id}', 'woven_linked', '${employeeId}', 'admin_confirmed_email', true, 'admin:linkreviewer@local.test')`);
      }
      const person: Person = { id, email, password, employeeId, sessions: [], cookies: [] };
      for (let i = 0; i < 2; i++) {
        const signed = await anonClient().auth.signInWithPassword({ email, password });
        if (!signed.data.session) throw new Error(`sign-in ${key}: ${signed.error?.message}`);
        person.sessions.push(signed.data.session);
        person.cookies.push(await cookieHeaderFor(signed.data.session));
      }
      people[key] = person;
    };

    /* The administrator who reviews and approves, and an ordinary manager (not an administrator). */
    await make("reviewer", "admin");
    await make("manager", "location_manager");
    reviewerId = people.reviewer!.id;
    managerId = people.manager!.id;

    /* The accounts under test: linked, person-approved, status-managed, Terminated in Woven (except where noted). */
    await make("target", "location_manager", { linked: true });
    await make("victimpartial", "location_manager", { linked: true, status: "active" });
    await make("victimcompany", "location_manager", { linked: true, status: "active" });
    await make("unreviewed", "location_manager", { linked: true, status: "active" });
    /* Protected: each linked and Terminated in Woven, so only protection stands between them and a disable. */
    await make("dm", "district_manager", { linked: true });
    await make("rm", "regional_manager", { linked: true });
    await make("switcher", "location_manager", { linked: true, id: APP_SWITCHER_USER_IDS[0]! });
    await make("adminterm", "admin", { linked: true });

    /* An Active bystander and the mappings the mass-change guards need. */
    sql(`insert into public.employee_access_directory (source_system, external_employee_id, email_address, employment_status, record_hash, first_name, last_name, woven_company_id)
         values ('woven', '${emp("bystander")}', 'bystander-${run}@gmail.test', 'active', '${"0".repeat(64)}', 'Pat', 'Bystander', '${COMPANY}')`);
    sql(`insert into public.woven_location_map (woven_location_id, woven_location_name, status, location_id, reviewed_by, reviewed_at, woven_company_id)
         values ('WL-T54-${run}', 'Example Location 307', 'mapped', 'loc-0307', 'test', now(), '${COMPANY}')`);
    sql(`insert into public.woven_position_map (woven_position_id, woven_position_name, status, mapped_role, mapped_scope_level, hierarchy_rank, reviewed_by, reviewed_at)
         values ('WP-T54-${run}', 'Location Manager T54', 'mapped', 'location_manager', 'location', 30, 'test', now())`);

    /* A recovery link obtained BEFORE termination — the "I kept a reset email" case. */
    const generated = await admin.auth.admin.generateLink({ type: "recovery", email: people.target!.email });
    recoveryHash = generated.data.properties?.hashed_token ?? "";
    expect(recoveryHash).not.toBe("");

    process.env.WOVEN_ACCESS_MODE = "shadow";
    process.env.WOVEN_TERMINATION_ENFORCEMENT = "on";
    freshSync();
  });

  afterAll(async () => {
    for (const k of touchedEnv) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    /* Leave the disposable database's directory quiet for the stack's other suites. */
    sql(`update public.employee_access_directory set employment_status = 'active' where external_employee_id like 'T54-${run}-%'`);
    for (const row of parked) sql(`update public.employee_access_directory set employment_status = '${row.status}' where external_employee_id = '${row.id}'`);
  });

  it("BEFORE: everyone can use Ask Bubbles' API; the target holds two live sessions", async () => {
    for (const key of ["target", "dm", "rm", "switcher", "adminterm"]) {
      expect((await authorize(people[key]!.cookies[0]!)).identity.subject).toBe(people[key]!.id);
    }
    expect(sessionCount("target")).toBe(2);
    expect((await anonClient().auth.getUser(people.target!.sessions[0]!.access_token)).data.user?.id).toBe(people.target!.id);
  });

  it("GATE CLOSED: switched on, Terminated in Woven, but no administrator review — nothing is disabled", async () => {
    const { runTerminationEnforcement } = await import("./termination-run");
    const outcome = await runTerminationEnforcement("cron");
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 0 } });
    expect(profile("target")).toBe("active");
    expect(banned("target")).toBe("false");
    expect(sessionCount("target")).toBe(2);
    expect((await authorize(people.target!.cookies[0]!)).identity.subject).toBe(people.target!.id);
  });

  it("SHADOW REVIEW: the shadow run lists the unprotected target ONLY; protected accounts are review-only; a non-administrator cannot review", async () => {
    freshSync();
    const { recordAccessShadowRun } = await import("./shadow");
    expect(await recordAccessShadowRun("cron")).toMatchObject({ status: "recorded", aborted: false });
    const { loadShadowReviewCandidates, runShadowReview } = await import("./shadow-review-run");
    const candidates = await loadShadowReviewCandidates();
    expect(candidates.employeeIds).toContain(people.target!.employeeId);
    for (const key of ["dm", "rm", "switcher", "adminterm", "victimpartial", "victimcompany", "reviewer", "manager"]) {
      expect(candidates.employeeIds, key).not.toContain(people[key]!.employeeId);
    }
    const input = { shadowRunId: candidates.shadowRunId!, employeeIds: [people.target!.employeeId], reason: "checked against HR" };
    expect(await runShadowReview(input, managerId)).toEqual({ status: "refused", code: "review_reviewer_not_admin" });
    expect(await runShadowReview({ ...input, employeeIds: [people.dm!.employeeId] }, reviewerId)).toEqual({ status: "refused", code: "review_unlisted_employee" });
    expect(await runShadowReview(input, reviewerId)).toMatchObject({ status: "recorded" });
    expect(profile("target")).toBe("active");
  });

  it("TERMINATE through the real enforcement path: completed, one account applied", async () => {
    const { runTerminationEnforcement } = await import("./termination-run");
    const before = applyRuns();
    const outcome = await runTerminationEnforcement("cron");
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 1, failed: 0 }, incompleteAccounts: 0, gate: null });
    expect(applyRuns()).toBe(before + 1);
    expect(lastApplyRun()).toBe("completed");
    expect(sql(`select result||':'||result_code from public.employee_access_actions where access_run_id = (select id from public.employee_access_runs where mode='apply' order by created_at desc, id desc limit 1) and app_user_id = '${people.target!.id}'`)).toBe("applied:disabled.auth_revoked");
  });

  it("REAL AUTH: profile disabled, auth user banned, every session and refresh token gone, audit and link records written", () => {
    expect(profile("target")).toBe("disabled");
    expect(banned("target")).toBe("true");
    expect(sessionCount("target")).toBe(0);
    expect(Number(sql(`select count(*) from auth.refresh_tokens where user_id = '${people.target!.id}'`))).toBe(0);
    expect(auditActions("target")).toBe("status_changed,access_revoked");
    expect(sql(`select actor_email from public.app_user_audit where target_user_id = '${people.target!.id}' and action = 'status_changed'`)).toBe("woven-termination:cron");
    expect(link("target")).toBe("true,true,false");
  });

  it("REAL AUTH: the old access token is refused by authorizeRequest and by Supabase Auth", async () => {
    await expect(authorize(people.target!.cookies[0]!)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(authorize(people.target!.cookies[1]!)).rejects.toMatchObject({ code: "unauthenticated" });
    const old = await anonClient().auth.getUser(people.target!.sessions[0]!.access_token);
    expect(old.data.user).toBeNull();
    expect(old.error).not.toBeNull();
  });

  it("REAL AUTH: neither refresh token works, password sign-in is banned, and the pre-termination recovery link is dead", async () => {
    for (const session of people.target!.sessions) {
      const refreshed = await anonClient().auth.refreshSession({ refresh_token: session.refresh_token });
      expect(refreshed.data.session).toBeNull();
      expect(refreshed.error).not.toBeNull();
    }
    const signed = await signIn(people.target!);
    expect(signed.data.session).toBeNull();
    expect(signed.error?.message ?? "").toMatch(/banned/i);
    const otp = await anonClient().auth.verifyOtp({ token_hash: recoveryHash, type: "recovery" });
    expect(otp.data.session).toBeNull();
    expect(otp.error).not.toBeNull();
  });

  it("PROTECTED: district manager, regional manager, app-switcher id and an administrator, all Terminated in Woven, are NOT disabled and their sessions survive", async () => {
    for (const key of ["dm", "rm", "switcher", "adminterm"]) {
      expect(profile(key), key).toBe("active");
      expect(banned(key), key).toBe("false");
      expect(sessionCount(key), key).toBe(2);
      expect(auditActions(key), key).toBe("");
      expect(link(key), key).toBe("false,false,false");
      expect((await authorize(people[key]!.cookies[0]!)).identity.subject).toBe(people[key]!.id);
      expect((await signIn(people[key]!)).data.session, key).not.toBeNull();
    }
    expect(sql(`select count(*) from public.employee_access_actions where result in ('applied','failed','skipped') and app_user_id in ('${["dm", "rm", "switcher", "adminterm"].map((k) => people[k]!.id).join("','")}')`)).toBe("0");
  });

  it("IDEMPOTENT: enforcing again does nothing — no new run, no new audit rows, still revoked", async () => {
    const { runTerminationEnforcement } = await import("./termination-run");
    const before = { runs: applyRuns(), audit: auditActions("target") };
    expect(await runTerminationEnforcement("cron")).toMatchObject({ status: "completed", tally: { applied: 0, failed: 0, skipped: 0 }, accessRunId: null });
    expect(applyRuns()).toBe(before.runs);
    expect(auditActions("target")).toBe(before.audit);
    expect(banned("target")).toBe("true");
    expect(sessionCount("target")).toBe(0);
  });

  it("MANUAL RE-ENABLE of an enforced account through User Management is refused and restores nothing", async () => {
    const { patchUser } = await import("@/lib/admin/user-directory");
    await expect(patchUser(people.target!.id, { status: "active" }, { id: reviewerId, email: people.reviewer!.email, role: "admin" })).rejects.toMatchObject({
      code: "rehire_approval_required",
      status: 409,
    });
    expect(profile("target")).toBe("disabled");
    expect((await signIn(people.target!)).data.session).toBeNull();
  });

  it("PARTIAL FAILURE: the ban fails after the profile is disabled — the run is recorded `failed`, never `completed`, and the account is reported incomplete", async () => {
    setStatus("victimpartial", "terminated");
    await shadowAndReview(["victimpartial"]).then(({ outcome }) => expect(outcome).toMatchObject({ status: "recorded" }));

    const { enforceTerminations } = await import("./terminate");
    const { readTerminationEnforcement } = await import("./termination-config");
    const { loadAccessPlan } = await import("./load");
    const { revokeAuthAccess } = await import("@/lib/auth/revocation");
    const { getSupabaseAdmin } = await import("@/lib/supabase/server");
    const { PINNED_COMPANY_ID } = await import("../config");
    const rpc = (fn: string, args: Record<string, unknown>) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    /* The real revocation, with ONLY the Auth ban made to fail; the session step is the real one. */
    const brokenBan = {
      auth: { admin: { updateUserById: async () => ({ error: { message: "auth unavailable" } }) } },
      rpc: (fn: "auth_revoke_user_sessions", args: { p_user_id: string }) => getSupabaseAdmin().rpc(fn, args),
    };
    const outcome = await enforceTerminations(
      { requestedBy: "cron", config: readTerminationEnforcement(process.env), accessMode: "shadow" },
      { loadPlan: loadAccessPlan, rpc, revokeAuth: (id) => revokeAuthAccess(id, brokenBan), pinnedCompanyId: PINNED_COMPANY_ID, protectedUserIds: APP_SWITCHER_USER_IDS },
    );
    expect(outcome).toMatchObject({ status: "failed", tally: { applied: 0, failed: 1 }, incompleteAccounts: 1 });
    expect(lastApplyRun()).toBe("failed");
    expect(sql(`select result_code from public.employee_access_actions where access_run_id = (select id from public.employee_access_runs where mode='apply' order by created_at desc, id desc limit 1) and app_user_id = '${people.victimpartial!.id}'`)).toBe("auth_revocation_incomplete.ban");
    expect(profile("victimpartial")).toBe("disabled");
    expect(link("victimpartial")).toBe("true,false,false"); // terminated, NOT revoked: the retry is owed
    expect(sessionCount("victimpartial")).toBe(0); // the real session step ran
    expect(banned("victimpartial")).toBe("false"); // ...but the ban did not
    expect(auditActions("victimpartial")).toBe("status_changed,access_revocation_incomplete");
    /* Not banned, so Auth still signs them in; the application layer (disabled profile) is what holds. */
    const signed = await signIn(people.victimpartial!);
    expect(signed.data.session).not.toBeNull();
    await expect(authorize(await cookieHeaderFor(signed.data.session!))).rejects.toBeTruthy();
  });

  it("RETRY completes the partial failure with no new review: banned, stamped, run recorded `completed`", async () => {
    const { runTerminationEnforcement } = await import("./termination-run");
    const outcome = await runTerminationEnforcement("cron");
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 1, failed: 0 }, incompleteAccounts: 0 });
    expect(lastApplyRun()).toBe("completed");
    expect(banned("victimpartial")).toBe("true");
    expect(link("victimpartial")).toBe("true,true,false");
    expect(auditActions("victimpartial")).toBe("status_changed,access_revocation_incomplete,access_revoked");
    expect((await signIn(people.victimpartial!)).data.session).toBeNull();
    /* ...and once more: idempotent. */
    const runs = applyRuns();
    expect(await runTerminationEnforcement("cron")).toMatchObject({ tally: { applied: 0 } });
    expect(applyRuns()).toBe(runs);
  });

  it("TENANT: a directory row of another company blocks the disable even after an administrator approved it", async () => {
    setStatus("victimcompany", "terminated");
    const { outcome } = await shadowAndReview(["victimcompany"]);
    expect(outcome).toMatchObject({ status: "recorded" });
    const { runTerminationEnforcement } = await import("./termination-run");
    await withForeignCompany("victimcompany", async () => {
      const result = await runTerminationEnforcement("cron");
      expect(result).toMatchObject({ status: "failed", tally: { applied: 0, failed: 1 }, incompleteAccounts: 1 });
      expect(lastApplyRun()).toBe("failed");
      expect(sql(`select result_code from public.employee_access_actions where access_run_id = (select id from public.employee_access_runs where mode='apply' order by created_at desc, id desc limit 1) and app_user_id = '${people.victimcompany!.id}'`)).toBe("disable_company_scope");
      expect(profile("victimcompany")).toBe("active");
      expect(banned("victimcompany")).toBe("false");
      expect(sessionCount("victimcompany")).toBe(2);
      expect((await authorize(people.victimcompany!.cookies[0]!)).identity.subject).toBe(people.victimcompany!.id);
    });
    /* A review of another company's row is refused in the first place. */
    await withForeignCompany("victimcompany", async () => {
      freshSync();
      const { recordAccessShadowRun } = await import("./shadow");
      await recordAccessShadowRun("cron");
      const { loadShadowReviewCandidates, runShadowReview } = await import("./shadow-review-run");
      const candidates = await loadShadowReviewCandidates();
      expect(await runShadowReview({ shadowRunId: candidates.shadowRunId!, employeeIds: [people.victimcompany!.employeeId], reason: "x" }, reviewerId)).toEqual({
        status: "refused",
        code: "review_company_scope",
      });
    });
    setStatus("victimcompany", "active");
  });

  it("THE DATABASE REFUSES ON ITS OWN: called directly (as a buggy or hostile caller would), it will not disable an unreviewed, unlisted or protected account, nor without the protected-id list", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/server");
    const call = (key: string, over: Record<string, unknown> = {}) =>
      getSupabaseAdmin().rpc("employee_access_disable_terminated", {
        p_app_user_id: people[key]!.id,
        p_external_employee_id: people[key]!.employeeId,
        p_woven_company_id: COMPANY,
        p_review_id: null,
        p_protected_user_ids: [...APP_SWITCHER_USER_IDS],
        p_set_by: "woven-termination:direct-call",
        ...over,
      });
    const refused = async (key: string, code: RegExp | string, over: Record<string, unknown> = {}) => {
      const sessionsBefore = sessionCount(key);
      const { error } = await call(key, over);
      expect(error?.message ?? "", key).toMatch(code instanceof RegExp ? code : new RegExp(`^${code}$`));
      expect(profile(key), key).toBe("active");
      expect(banned(key), key).toBe("false");
      expect(sessionCount(key), key).toBe(sessionsBefore);
      expect(sessionsBefore, key).toBeGreaterThanOrEqual(2);
    };

    /* Protected accounts, Terminated in Woven, with a gate that is open for somebody else. */
    setStatus("victimcompany", "terminated");
    const { outcome } = await shadowAndReview(["victimcompany"]);
    expect(outcome).toMatchObject({ status: "recorded" });
    const { data: state } = await getSupabaseAdmin().rpc("employee_access_review_state", {});
    const reviewId = (state as { review_id: string }).review_id;
    for (const key of ["dm", "rm", "switcher", "adminterm"]) await refused(key, "disable_protected_account", { p_review_id: reviewId });

    /* No review at all, a review that does not list the employee, and no protected-id list. */
    setStatus("unreviewed", "terminated");
    await refused("unreviewed", /^disable_review_/);
    await refused("unreviewed", "disable_not_in_reviewed_list", { p_review_id: reviewId });
    await refused("unreviewed", "disable_protected_ids_required", { p_protected_user_ids: [] });
    await refused("unreviewed", "disable_protected_ids_required", { p_protected_user_ids: null });
    /* Another company stated by the caller. */
    await refused("unreviewed", "disable_company_scope", { p_review_id: reviewId, p_woven_company_id: FOREIGN_COMPANY });

    setStatus("unreviewed", "active");
    setStatus("victimcompany", "active");
    expect(auditActions("unreviewed")).toBe("");
  });

  it("NOTHING AUTOMATIC RESTORES ACCESS: Woven shows the target Active again, and the full enforcement and shadow cycle leaves them disabled, banned, signed out and flagged for review", async () => {
    setStatus("target", "active");
    freshSync();
    const { runTerminationEnforcement } = await import("./termination-run");
    const { recordAccessShadowRun } = await import("./shadow");
    const { loadAccessPlan } = await import("./load");
    for (let i = 0; i < 2; i++) {
      await runTerminationEnforcement("cron");
      await recordAccessShadowRun("cron");
    }
    expect(profile("target")).toBe("disabled");
    expect(banned("target")).toBe("true");
    expect((await signIn(people.target!)).data.session).toBeNull();
    expect(link("target")).toBe("true,true,false");
    const row = (await loadAccessPlan()).rows.find((r) => r.externalEmployeeId === people.target!.employeeId)!;
    expect(row.actions).toContain("FLAG_REHIRE_REVIEW");
    expect(auditActions("target")).toBe("status_changed,access_revoked");
  });

  it("REHIRE REFUSALS: not Terminated-then-Active, a non-administrator, no reason, another company's row — each refused, nothing restored", async () => {
    const { approveRehire, parseRehire, RehireInputError } = await import("./rehire");
    const { runRehireApproval } = await import("./rehire-run");
    const { getSupabaseAdmin } = await import("@/lib/supabase/server");
    const { PINNED_COMPANY_ID } = await import("../config");
    const rpc = (fn: string, args: Record<string, unknown>) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    const target = people.target!;
    const input = { appUserId: target.id, externalEmployeeId: target.employeeId, reason: "Rehired 2 Nov, confirmed with HR" };
    const expectStillRevoked = async () => {
      expect(profile("target")).toBe("disabled");
      expect(banned("target")).toBe("true");
      expect((await signIn(target)).data.session).toBeNull();
      expect(auditActions("target")).toBe("status_changed,access_revoked");
    };

    /* Woven still says Terminated for the partial victim: refused. */
    const victim = people.victimpartial!;
    expect(await runRehireApproval({ appUserId: victim.id, externalEmployeeId: victim.employeeId, reason: "r" }, reviewerId)).toEqual({ status: "refused", code: "rehire_not_active_in_latest_read" });

    freshSync();
    /* Not an administrator. */
    expect(await runRehireApproval(input, managerId)).toEqual({ status: "refused", code: "rehire_approver_not_admin" });
    /* A written reason is required (the route's parser, and the database even if the parser were bypassed). */
    expect(() => parseRehire({ ...input, reason: "  " })).toThrow(RehireInputError);
    expect(await approveRehire({ ...input, reason: "   " }, reviewerId, { rpc, restoreAuth: async () => ({ ok: true }), pinnedCompanyId: PINNED_COMPANY_ID })).toEqual({ status: "refused", code: "rehire_reason_required" });
    /* The approver cannot be the account. */
    expect(await runRehireApproval(input, target.id)).toEqual({ status: "refused", code: "rehire_approver_not_admin" });
    /* The directory row is another company's. */
    await withForeignCompany("target", async () => {
      expect(await runRehireApproval(input, reviewerId)).toEqual({ status: "refused", code: "rehire_company_scope" });
    });
    /* A failed latest sync. */
    sql(`insert into public.employee_sync_runs (requested_by, source_mode, status, error_code, finished_at) values ('cron', 'scheduled_poll', 'failed', 'woven_unreachable', now())`);
    expect(await runRehireApproval(input, reviewerId)).toEqual({ status: "refused", code: "rehire_directory_not_current" });
    freshSync();
    await expectStillRevoked();
  });

  it("REHIRE: an administrator's approval with a reason restores sign-in on real Auth; audit names the approver and reason; a repeat is a no-op", async () => {
    const { runRehireApproval } = await import("./rehire-run");
    const target = people.target!;
    const input = { appUserId: target.id, externalEmployeeId: target.employeeId, reason: "Rehired 2 Nov, confirmed with HR" };
    freshSync();
    expect(await runRehireApproval(input, reviewerId)).toEqual({ status: "rehired" });

    expect(profile("target")).toBe("active");
    expect(banned("target")).toBe("false");
    expect(link("target")).toBe("true,false,true");
    const signed = await signIn(target);
    expect(signed.error).toBeNull();
    expect((await authorize(await cookieHeaderFor(signed.data.session!))).identity.subject).toBe(target.id);
    expect(auditActions("target")).toBe("status_changed,access_revoked,status_changed,woven_rehire_approved,access_restored");
    expect(sql(`select actor_user_id::text || '|' || to_value from public.app_user_audit where target_user_id = '${target.id}' and action = 'woven_rehire_approved'`)).toBe(
      `${reviewerId}|active in Woven; reason: Rehired 2 Nov, confirmed with HR`,
    );

    const audit = auditActions("target");
    expect(await runRehireApproval(input, reviewerId)).toEqual({ status: "already_rehired" });
    expect(auditActions("target")).toBe(audit);
  });

  it("REHIRE PARTIAL FAILURE: the ban cannot be lifted — reported incomplete, the profile goes back to disabled, sign-in stays refused; the retry completes", async () => {
    setStatus("victimpartial", "active");
    freshSync();
    const { approveRehire } = await import("./rehire");
    const { runRehireApproval } = await import("./rehire-run");
    const { getSupabaseAdmin } = await import("@/lib/supabase/server");
    const { PINNED_COMPANY_ID } = await import("../config");
    const rpc = (fn: string, args: Record<string, unknown>) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    const victim = people.victimpartial!;
    const input = { appUserId: victim.id, externalEmployeeId: victim.employeeId, reason: "Rehired, confirmed with HR" };

    const failed = await approveRehire(input, reviewerId, { rpc, restoreAuth: async () => ({ ok: false }), pinnedCompanyId: PINNED_COMPANY_ID });
    expect(failed).toEqual({ status: "incomplete", code: "unban_failed_reverted" });
    expect(profile("victimpartial")).toBe("disabled");
    expect(banned("victimpartial")).toBe("true");
    expect(link("victimpartial")).toBe("true,true,false");
    expect((await signIn(victim)).data.session).toBeNull();
    expect(auditActions("victimpartial")).toMatch(/woven_rehire_approved,access_revocation_incomplete$/);

    expect(await runRehireApproval(input, reviewerId)).toEqual({ status: "rehired" });
    expect(profile("victimpartial")).toBe("active");
    expect(banned("victimpartial")).toBe("false");
    expect(link("victimpartial")).toBe("true,false,true");
    expect((await signIn(victim)).error).toBeNull();
  });
});
