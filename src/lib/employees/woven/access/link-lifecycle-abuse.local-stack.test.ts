import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ============================================================================
 * NEGATIVE SECURITY TESTS FOR THE LINKS-GUARD LIFECYCLE EXCEPTION
 * ============================================================================
 *
 * Runs only on the disposable local stack (`npm run stack:up`, then
 * `npm run test:local-stack`). Every request goes through the real gateway and
 * PostgREST with real keys: anonymous, a signed-in ADMINISTRATOR's own token
 * (the most privileged non-server caller there is), and the server's
 * service_role. The question for each: can that caller change an
 * employee_account_links row, or call a lifecycle function, outside what the
 * review-gated server path allows?
 *
 * Nothing here ever succeeds, and every attempt is followed by a check, straight
 * in Postgres, that the rows are byte-for-byte what they were.
 */

const ENABLED = process.env.ASK_BUBBLES_LOCAL_STACK === "1";
const URL_ = process.env.LOCAL_STACK_URL ?? "";
const ANON = process.env.LOCAL_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SERVICE_ROLE_KEY ?? "";
const PG = process.env.LOCAL_STACK_PG ?? "";
const COMPANY = "55839f24-9241-418c-8405-37baf9a42a87";

const sql = (query: string) => execFileSync("psql", [PG, "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();

interface Reply {
  status: number;
  body: { code?: string; message?: string } | unknown[] | null;
}

async function call(method: string, path: string, key: string, jwt: string | null, body?: unknown): Promise<Reply> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${jwt ?? key}`, "content-type": "application/json", prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const refused = (r: Reply) => r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0);

describe.skipIf(!ENABLED)("links guard lifecycle exception: negative security tests (local stack)", { timeout: 120_000 }, () => {
  const run = randomUUID().slice(0, 6);
  const adminId = randomUUID();
  const victimId = randomUUID();
  const protectedId = randomUUID();
  const victimEmp = `ABUSE-${run}-V`;
  const protectedEmp = `ABUSE-${run}-P`;
  let adminJwt = "";
  const linkSnapshot = (id: string) => sql(`select row_to_json(l)::text from public.employee_account_links l where app_user_id = '${id}'`);
  const profileSnapshot = (id: string) => sql(`select status::text || ',' || role::text from public.app_users where id = '${id}'`);
  const auditCount = () => Number(sql(`select count(*) from public.app_user_audit`));
  const runsCount = () => Number(sql(`select count(*) from public.employee_access_runs`));
  const reviewsCount = () => Number(sql(`select count(*) from public.employee_access_shadow_reviews`));
  const reviewersCount = () => Number(sql(`select count(*) from public.woven_enforcement_reviewers`));
  let before = { victim: "", protected: "", victimProfile: "", protectedProfile: "", audit: 0, runs: 0, reviews: 0, reviewers: 0 };
  const snapshot = () => ({
    victim: linkSnapshot(victimId),
    protected: linkSnapshot(protectedId),
    victimProfile: profileSnapshot(victimId),
    protectedProfile: profileSnapshot(protectedId),
    audit: auditCount(),
    runs: runsCount(),
    reviews: reviewsCount(),
    reviewers: reviewersCount(),
  });
  const unchanged = () => expect(snapshot()).toEqual(before);

  beforeAll(async () => {
    expect(new URL(URL_).hostname).toBe("127.0.0.1");
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const password = `P-${randomUUID()}`;
    for (const [id, tag] of [[adminId, "admin"], [victimId, "victim"], [protectedId, "protected"]] as const) {
      const { error } = await admin.auth.admin.createUser({ id, email: `abuse-${run}-${tag}@example.test`, password, email_confirm: true });
      expect(error).toBeNull();
    }
    sql(`insert into public.app_users (id, email, display_name, role, status, scope_level, scope_primary_area_id) values
      ('${adminId}', 'abuse-${run}-admin@example.test', 'Abuse Admin', 'owner', 'active', 'global', null),
      ('${victimId}', 'abuse-${run}-victim@example.test', 'Abuse Victim', 'location_manager', 'active', 'location', 'loc-0307'),
      ('${protectedId}', 'abuse-${run}-protected@example.test', 'Abuse Protected', 'district_manager', 'active', 'district', 'dist-abuse')`);
    sql(`insert into public.employee_account_links (app_user_id, management, external_employee_id, link_method, managed_status, set_by) values
      ('${victimId}', 'woven_linked', '${victimEmp}', 'admin_confirmed_email', true, 'admin:reviewer@example.test'),
      ('${protectedId}', 'woven_linked', '${protectedEmp}', 'admin_confirmed_email', true, 'admin:reviewer@example.test')`);
    const signedIn = await createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({
      email: `abuse-${run}-admin@example.test`,
      password,
    });
    expect(signedIn.error).toBeNull();
    adminJwt = signedIn.data.session!.access_token;
    before = snapshot();
  });

  afterAll(async () => {
    if (!ENABLED) return;
    sql(`delete from public.employee_account_links where app_user_id in ('${victimId}', '${protectedId}')`);
    sql(`delete from public.app_user_audit where target_user_id in ('${adminId}', '${victimId}', '${protectedId}')`);
    sql(`delete from public.app_users where id in ('${adminId}', '${victimId}', '${protectedId}')`);
    sql(`delete from auth.users where id in ('${adminId}', '${victimId}', '${protectedId}')`);
  });

  const fnCalls = (): [string, Record<string, unknown>][] => [
    ["employee_access_review_state", {}],
    ["employee_access_record_shadow_review", { p_shadow_run_id: randomUUID(), p_reviewer: adminId, p_employee_ids: [victimEmp], p_ids_sha256: "x", p_woven_company_id: COMPANY, p_reason: "abuse" }],
    ["employee_access_disable_terminated", { p_app_user_id: victimId, p_external_employee_id: victimEmp, p_woven_company_id: COMPANY, p_review_id: randomUUID(), p_protected_user_ids: [], p_set_by: "abuse" }],
    ["employee_access_record_revocation", { p_app_user_id: victimId, p_ok: true, p_detail: "abuse", p_set_by: "abuse" }],
    ["employee_access_approve_rehire", { p_app_user_id: victimId, p_external_employee_id: victimEmp, p_woven_company_id: COMPANY, p_approver: adminId, p_reason: "abuse" }],
    ["employee_access_record_rehire", { p_app_user_id: victimId, p_approver: adminId, p_ok: true, p_detail: "abuse" }],
    ["employee_access_designate_reviewer", { p_user_id: adminId, p_actor: adminId, p_reason: "abuse" }],
    ["employee_access_revoke_reviewer", { p_user_id: adminId, p_actor: adminId, p_reason: "abuse" }],
    ["employee_access_record_apply_run", { p_requested_by: "abuse", p_directory_run_id: null, p_policy_version: "x", p_status: "completed", p_guard_codes: [], p_counts: {}, p_actions: [] }],
    ["auth_clear_user_credentials", { p_user_id: victimId }],
  ];

  it("no database role but service_role can execute any lifecycle, review or credential function (checked for every function, not a sample)", () => {
    const rows = sql(`
      select p.oid::regprocedure::text || '|' || has_function_privilege('anon', p.oid, 'execute') || '|' || has_function_privilege('authenticated', p.oid, 'execute')
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and (p.proname like 'employee_access_%' or p.proname like 'auth_%' or p.proname = 'employee_account_links_guard_update' or p.proname = 'woven_enforcement_reviewers_guard')
       order by 1`).split("\n");
    expect(rows.length).toBeGreaterThanOrEqual(15);
    for (const row of rows) expect(row, row).toMatch(/\|false\|false$/);
  });

  for (const who of ["anonymous", "a signed-in administrator"] as const) {
    describe(`as ${who}`, () => {
      const key = ANON;
      const jwt = () => (who === "anonymous" ? null : adminJwt);

      it("cannot call any lifecycle, review or credential function over the API", async () => {
        for (const [fn, args] of fnCalls()) {
          const r = await call("POST", `rpc/${fn}`, key, jwt(), args);
          expect(r.status, `${fn}: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400);
        }
        unchanged();
      });

      it("cannot read or write link rows, the reviewer list or the shadow reviews", async () => {
        for (const table of ["employee_account_links", "woven_enforcement_reviewers", "employee_access_shadow_reviews", "employee_access_runs"]) {
          const read = await call("GET", `${table}?select=*&limit=1`, key, jwt());
          expect(read.status === 200 && Array.isArray(read.body) && read.body.length > 0, `${table} readable`).toBe(false);
        }
        const patchStamps = await call("PATCH", `employee_account_links?app_user_id=eq.${victimId}`, key, jwt(), { terminated_at: new Date().toISOString(), access_revoked_at: new Date().toISOString(), last_synced_at: new Date().toISOString() });
        expect(refused(patchStamps)).toBe(true);
        const patchFlag = await call("PATCH", `employee_account_links?app_user_id=eq.${victimId}`, key, jwt(), { managed_status: false });
        expect(refused(patchFlag)).toBe(true);
        const insertReviewer = await call("POST", "woven_enforcement_reviewers", key, jwt(), { user_id: adminId });
        expect(refused(insertReviewer)).toBe(true);
        const del = await call("DELETE", `employee_account_links?app_user_id=eq.${victimId}`, key, jwt());
        expect(refused(del)).toBe(true);
        unchanged();
      });
    });
  }

  describe("as the server's own role (service_role): the exception does not widen what it may do", () => {
    it("cannot write a lifecycle stamp or any identity column, even though it can reach the endpoint", async () => {
      const stamp = new Date().toISOString();
      const bodies: Record<string, unknown>[] = [
        { terminated_at: stamp },
        { reactivated_at: stamp },
        { access_revoked_at: stamp },
        { revoked_woven_status: "terminated" },
        { last_synced_at: stamp },
        { external_employee_id: "ABUSE-OTHER" },
        { app_user_id: randomUUID() },
        { management: "not_woven_managed" },
        { link_method: "admin_manual" },
        { set_by: "someone else" },
        { reason: "edited" },
        { created_at: stamp },
        { first_provisioned_at: stamp },
        { provisioned_by_source: "woven" },
        // a permitted flag mixed into a forbidden write must not smuggle it through
        { managed_status: true, terminated_at: stamp },
        { managed_role: true, external_employee_id: "ABUSE-OTHER" },
      ];
      for (const body of bodies) {
        const r = await call("PATCH", `employee_account_links?app_user_id=eq.${victimId}`, SERVICE, null, body);
        expect(r.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      }
      unchanged();
    });

    it("cannot reach the setting from the API: no function that sets it, or runs arbitrary SQL, is exposed", async () => {
      for (const fn of ["set_config", "pg_catalog.set_config", "exec_sql", "execute_sql", "run_sql"]) {
        const r = await call("POST", `rpc/${fn}`, SERVICE, null, { setting_name: "app.woven_link_lifecycle", new_value: "on", is_local: true });
        expect(r.status, fn).toBeGreaterThanOrEqual(400);
      }
      const exposed = sql(`
        select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and has_function_privilege('service_role', p.oid, 'execute')
           and (pg_get_functiondef(p.oid) ilike '%set_config(%' ) and p.proname not in (
             'employee_access_disable_terminated','employee_access_record_revocation','employee_access_approve_rehire','employee_access_record_rehire')`);
      expect(Number(exposed)).toBe(0);
    });

    it("the four functions that do set it are refused for protected accounts, unreviewed accounts and accounts that were never terminated", async () => {
      const outcomes: [string, Record<string, unknown>][] = [
        // not reviewed, no designated reviewer
        ["employee_access_disable_terminated", { p_app_user_id: victimId, p_external_employee_id: victimEmp, p_woven_company_id: COMPANY, p_review_id: randomUUID(), p_protected_user_ids: [], p_set_by: "abuse" }],
        // protected: listed as protected, and an administrator by role
        ["employee_access_disable_terminated", { p_app_user_id: protectedId, p_external_employee_id: protectedEmp, p_woven_company_id: COMPANY, p_review_id: randomUUID(), p_protected_user_ids: [protectedId], p_set_by: "abuse" }],
        // the administrator account itself, with an empty protected list: the database still refuses
        ["employee_access_disable_terminated", { p_app_user_id: adminId, p_external_employee_id: "ABUSE-ADMIN", p_woven_company_id: COMPANY, p_review_id: randomUUID(), p_protected_user_ids: [], p_set_by: "abuse" }],
        // wrong company
        ["employee_access_disable_terminated", { p_app_user_id: victimId, p_external_employee_id: victimEmp, p_woven_company_id: "1ba00000-0000-4000-8000-0000000000aa", p_review_id: randomUUID(), p_protected_user_ids: [], p_set_by: "abuse" }],
        // stamping a revocation on an account that was never terminated
        ["employee_access_record_revocation", { p_app_user_id: victimId, p_ok: true, p_detail: "abuse", p_set_by: "abuse" }],
        // rehire with nobody approving, self approval, and an unrevoked account
        ["employee_access_approve_rehire", { p_app_user_id: victimId, p_external_employee_id: victimEmp, p_woven_company_id: COMPANY, p_approver: victimId, p_reason: "abuse" }],
        ["employee_access_approve_rehire", { p_app_user_id: victimId, p_external_employee_id: victimEmp, p_woven_company_id: COMPANY, p_approver: adminId, p_reason: "" }],
        ["employee_access_record_rehire", { p_app_user_id: victimId, p_approver: adminId, p_ok: true, p_detail: "abuse" }],
        // a review recorded for a run that does not exist
        ["employee_access_record_shadow_review", { p_shadow_run_id: randomUUID(), p_reviewer: adminId, p_employee_ids: [victimEmp], p_ids_sha256: "x", p_woven_company_id: COMPANY, p_reason: "abuse" }],
        // an administrator designating themselves as the reviewer
        ["employee_access_designate_reviewer", { p_user_id: adminId, p_actor: adminId, p_reason: "abuse" }],
      ];
      for (const [fn, args] of outcomes) {
        const r = await call("POST", `rpc/${fn}`, SERVICE, null, args);
        expect(r.status, `${fn} ${JSON.stringify(args).slice(0, 60)}: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400);
      }
      unchanged();
    });
  });

  it("the setting does not survive: a stamp is refused again straight after the API calls above", () => {
    let message = "";
    try {
      sql(`update public.employee_account_links set last_synced_at = now() where app_user_id = '${victimId}'`);
    } catch (error) {
      message = String((error as { stderr?: string }).stderr ?? error);
    }
    expect(message).toContain("only managed_status, managed_location and managed_role can change");
    unchanged();
  });
});
