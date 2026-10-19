import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ============================================================================
 * TERMINATION AGAINST A REAL SUPABASE AUTH SERVER — the disposable local stack
 * ============================================================================
 *
 * Runs only when `scripts/local-stack/up.sh` has started the local stack and
 * its environment is exported (`ASK_BUBBLES_LOCAL_STACK=1`). Never against the
 * Ask Bubbles project: every URL and key below comes from the local env file, and
 * the suite refuses a URL that is not 127.0.0.1.
 *
 *   set -a; . /tmp/ask-bubbles-local-stack/env; set +a
 *   npx vitest run src/lib/auth/revocation.local-stack.test.ts
 *
 * It drives the REAL code path an administrator's "Disable" takes —
 * `patchUser` → `app_users` → `revokeAuthAccess` (Auth Admin ban + the
 * `auth_revoke_user_sessions` function) — and then proves, against Supabase
 * Auth (GoTrue v2.180), PostgREST and Postgres with every migration applied,
 * what the person can and cannot still do.
 */

const ENABLED = process.env.ASK_BUBBLES_LOCAL_STACK === "1";
const URL_ = process.env.LOCAL_STACK_URL ?? "";
const ANON = process.env.LOCAL_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SERVICE_ROLE_KEY ?? "";
const PG = process.env.LOCAL_STACK_PG ?? "";
const MAIL = process.env.LOCAL_STACK_MAIL_API ?? "";

const run = randomBytes(4).toString("hex");
/* Per run, so the suite can be re-run against the same stack. */
const SCOPE = `scope-${run}`;
const TARGET_EMAIL = `terminated-${run}@local.test`;
const CONTROL_EMAIL = `control-${run}@local.test`;
const ADMIN_EMAIL = `admin-${run}@local.test`;
/* Test-only credentials for throwaway users in a throwaway database. */
const TARGET_PW = `T-${randomBytes(12).toString("hex")}`;
const CONTROL_PW = `C-${randomBytes(12).toString("hex")}`;

function sql(query: string): string {
  return execFileSync("psql", [PG, "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}

const anonClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
/** A client that presents ONE access token, as a raw PostgREST caller would. */
const tokenClient = (accessToken: string) =>
  createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

/** The cookie header the browser would send for a session, written by @supabase/ssr itself. */
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

async function mailTo(address: string): Promise<number> {
  const response = await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${address}`)}`);
  const body = (await response.json()) as { messages_count?: number; messages?: unknown[] };
  return body.messages_count ?? body.messages?.length ?? 0;
}

describe.skipIf(!ENABLED)("termination on a real Supabase Auth server (local stack)", { timeout: 60_000 }, () => {
  let admin: SupabaseClient;
  let targetId = "";
  let controlId = "";
  let adminId = "";
  let sessionA: Session;
  let sessionB: Session;
  let cookieA = "";
  let preBanRecoveryHash = "";
  let documentId = "";
  let conversationId = "";

  beforeAll(async () => {
    expect(new URL(URL_).hostname).toBe("127.0.0.1");
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON;
    process.env.SUPABASE_SECRET_KEY = SERVICE;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;

    admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const make = async (email: string, password?: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
      return data.user.id;
    };
    targetId = await make(TARGET_EMAIL, TARGET_PW);
    controlId = await make(CONTROL_EMAIL, CONTROL_PW);
    adminId = await make(ADMIN_EMAIL);

    const profile = (id: string, email: string, role: string, scope: Record<string, unknown>) => ({
      id, email, display_name: email.split("@")[0], role, status: "active", ...scope,
    });
    const location = { scope_level: "location", scope_primary_area_id: "loc-0307", scope_also_covers_area_ids: [] };
    const global = { scope_level: "global", scope_primary_area_id: null, scope_also_covers_area_ids: [] };
    const { error: profilesError } = await admin.from("app_users").insert([
      profile(targetId, TARGET_EMAIL, "location_manager", location),
      profile(controlId, CONTROL_EMAIL, "location_manager", location),
      profile(adminId, ADMIN_EMAIL, "admin", global),
    ]);
    if (profilesError) throw new Error(`profiles: ${profilesError.message}`);

    /* One indexed knowledge document with one chunk, and one piece of the terminated person's own history. */
    documentId = randomUUID();
    sql(`insert into public.knowledge_documents (id, knowledge_scope_id, title, original_filename, mime_type, file_type, storage_path, size_bytes, status, indexed, indexed_at)
         values ('${documentId}', '${SCOPE}', 'Opening checklist', 'open.pdf', 'application/pdf', 'pdf', '${SCOPE}/open.pdf', 10, 'indexed', true, now())`);
    sql(`insert into public.knowledge_chunks (document_id, knowledge_scope_id, chunk_index, content, locator, embedding_model, embedding)
         values ('${documentId}', '${SCOPE}', 0, 'Unlock the front door.', 'p1', 'local', array_fill(0.1::real, array[384])::extensions.vector)`);
    conversationId = randomUUID();
    sql(`insert into public.chat_conversations (id, user_id, client_conversation_id, title) values ('${conversationId}', '${targetId}', 'local-${run}', 'Opening questions')`);

    /* The person is signed in on TWO devices before they are terminated. */
    const signA = await anonClient().auth.signInWithPassword({ email: TARGET_EMAIL, password: TARGET_PW });
    const signB = await anonClient().auth.signInWithPassword({ email: TARGET_EMAIL, password: TARGET_PW });
    if (!signA.data.session || !signB.data.session) throw new Error(`sign-in: ${signA.error?.message ?? signB.error?.message}`);
    sessionA = signA.data.session;
    sessionB = signB.data.session;
    cookieA = await cookieHeaderFor(sessionA);

    /* A recovery link obtained BEFORE termination — the "I kept a reset email" case. */
    const link = await admin.auth.admin.generateLink({ type: "recovery", email: TARGET_EMAIL });
    preBanRecoveryHash = link.data.properties?.hashed_token ?? "";
    expect(preBanRecoveryHash).not.toBe("");
  });

  afterAll(async () => {
    /* Disposable stack; nothing to clean in a shared system. */
  });

  it("BEFORE: the person can use Ask Bubbles' API, read knowledge with their token, and holds two sessions", async () => {
    const { authorizeRequest } = await import("@/lib/auth/server");
    const context = await authorizeRequest(new Request("http://127.0.0.1:3000/api/x", { headers: { cookie: cookieA } }), "ask_questions");
    expect(context.identity.subject).toBe(targetId);

    /*
     * Knowledge is SERVER-ONLY (20261003001000_knowledge_server_only): no signed-in account may read the
     * knowledge tables directly with its own token, so "can use Ask Bubbles" is proved through the server's
     * own gate (above) and through Supabase Auth accepting the access token (below). The direct-read denial
     * is pinned for the active person here and for the colleague in CONTROL, so it is not mistaken later
     * for the effect of termination.
     */
    const live = await anonClient().auth.getUser(sessionA.access_token);
    expect(live.error).toBeNull();
    expect(live.data.user?.id).toBe(targetId);
    const direct = await tokenClient(sessionA.access_token).from("knowledge_documents").select("id").eq("knowledge_scope_id", SCOPE);
    expect(direct.data ?? []).toEqual([]);
    expect(direct.error?.message ?? "").toMatch(/permission denied/i);

    expect(Number(sql(`select count(*) from auth.sessions where user_id = '${targetId}'`))).toBe(2);
  });

  it("TERMINATE through the real admin path: profile disabled, auth user banned, every session revoked", async () => {
    const { patchUser } = await import("@/lib/admin/user-directory");
    const updated = await patchUser(targetId, { status: "disabled" }, { id: adminId, email: ADMIN_EMAIL, role: "admin" });
    expect(updated.status).toBe("disabled");

    expect(sql(`select status from public.app_users where id = '${targetId}'`)).toBe("disabled");
    expect(sql(`select banned_until > now() + interval '50 years' from auth.users where id = '${targetId}'`)).toBe("t");
    expect(Number(sql(`select count(*) from auth.sessions where user_id = '${targetId}'`))).toBe(0);
    expect(Number(sql(`select count(*) from auth.refresh_tokens where user_id = '${targetId}'`))).toBe(0);
    expect(sql(`select string_agg(action, ',' order by created_at) from public.app_user_audit where target_user_id = '${targetId}'`)).toBe(
      "status_changed,access_revoked",
    );
  });

  it("cannot sign in again with their password", async () => {
    const { data, error } = await anonClient().auth.signInWithPassword({ email: TARGET_EMAIL, password: TARGET_PW });
    expect(data.session).toBeNull();
    expect(error?.message ?? "").toMatch(/banned/i);
  });

  it("cannot refresh either revoked session", async () => {
    for (const session of [sessionA, sessionB]) {
      const { data, error } = await anonClient().auth.refreshSession({ refresh_token: session.refresh_token });
      expect(data.session).toBeNull();
      expect(error).not.toBeNull();
    }
  });

  it("cannot use Ask Bubbles' API with the still-unexpired access token in their cookie", async () => {
    const { authorizeRequest } = await import("@/lib/auth/server");
    await expect(
      authorizeRequest(new Request("http://127.0.0.1:3000/api/x", { headers: { cookie: cookieA } }), "ask_questions"),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("the old access token is no longer accepted by Supabase Auth, and the knowledge tables stay closed to it", async () => {
    /* The session row is gone, so Auth refuses the still-unexpired JWT. */
    const revoked = await anonClient().auth.getUser(sessionA.access_token);
    expect(revoked.data.user).toBeNull();
    expect(revoked.error).not.toBeNull();

    const client = tokenClient(sessionA.access_token);
    const documents = await client.from("knowledge_documents").select("id").eq("knowledge_scope_id", SCOPE);
    const chunks = await client.from("knowledge_chunks").select("id").eq("knowledge_scope_id", SCOPE);
    const matched = await client.rpc("match_knowledge_chunks", {
      query_embedding: `[${Array(384).fill(0.1).join(",")}]`,
      scope_id: SCOPE,
    });
    expect(documents.data ?? []).toEqual([]);
    expect(chunks.data ?? []).toEqual([]);
    expect(matched.data ?? []).toEqual([]);
  });

  it("CONTROL: an active colleague's token still works for Ask Bubbles' API and at Auth, and the knowledge tables are closed to them too (server-only policy), so the denial above is not simply a closed policy", async () => {
    const { data } = await anonClient().auth.signInWithPassword({ email: CONTROL_EMAIL, password: CONTROL_PW });
    const session = data.session!;
    expect((await anonClient().auth.getUser(session.access_token)).data.user?.id).toBe(controlId);
    const { authorizeRequest } = await import("@/lib/auth/server");
    const context = await authorizeRequest(new Request("http://127.0.0.1:3000/api/x", { headers: { cookie: await cookieHeaderFor(session) } }), "ask_questions");
    expect(context.identity.subject).toBe(controlId);
    const direct = await tokenClient(session.access_token).from("knowledge_documents").select("id").eq("knowledge_scope_id", SCOPE);
    expect(direct.error?.message ?? "").toMatch(/permission denied/i);
  });

  it("cannot use Forgot Password: our route sends nothing (and says the same thing), while a colleague's request does send", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const ask = (email: string) =>
      POST(
        new Request("http://127.0.0.1:3000/api/auth/forgot-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }),
      );
    const before = await mailTo(TARGET_EMAIL);
    const refused = await ask(TARGET_EMAIL);
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({ ok: true });

    const allowed = await ask(CONTROL_EMAIL);
    expect(await allowed.json()).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await mailTo(TARGET_EMAIL)).toBe(before);
    expect(await mailTo(CONTROL_EMAIL)).toBeGreaterThanOrEqual(1);
  });

  it("cannot regain access through Supabase directly: a recovery link minted BEFORE termination no longer signs in", async () => {
    const { data, error } = await anonClient().auth.verifyOtp({ token_hash: preBanRecoveryHash, type: "recovery" });
    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("history is intact: the auth user, the profile, their conversation and the audit trail all remain", async () => {
    const { data } = await admin.auth.admin.getUserById(targetId);
    expect(data.user?.id).toBe(targetId);
    expect(sql(`select count(*) from public.app_users where id = '${targetId}'`)).toBe("1");
    expect(sql(`select count(*) from public.chat_conversations where id = '${conversationId}' and user_id = '${targetId}'`)).toBe("1");
    expect(Number(sql(`select count(*) from public.app_user_audit where target_user_id = '${targetId}'`))).toBeGreaterThanOrEqual(2);
  });

  it("disabling again is idempotent and still complete", async () => {
    const { patchUser } = await import("@/lib/admin/user-directory");
    await patchUser(targetId, { status: "disabled" }, { id: adminId, email: ADMIN_EMAIL, role: "admin" });
    expect(sql(`select banned_until > now() from auth.users where id = '${targetId}'`)).toBe("t");
    expect(Number(sql(`select count(*) from auth.sessions where user_id = '${targetId}'`))).toBe(0);
  });

  it("an explicit re-enable (the approved-rehire mechanics) lifts the ban and the password works again", async () => {
    const { patchUser } = await import("@/lib/admin/user-directory");
    await patchUser(targetId, { status: "active" }, { id: adminId, email: ADMIN_EMAIL, role: "admin" });
    expect(sql(`select coalesce(banned_until < now(), true) from auth.users where id = '${targetId}'`)).toBe("t");
    const { data, error } = await anonClient().auth.signInWithPassword({ email: TARGET_EMAIL, password: TARGET_PW });
    expect(error).toBeNull();
    /* Signed in again, and the server's own gate lets them use Ask Bubbles again (knowledge itself is server-only). */
    const { authorizeRequest } = await import("@/lib/auth/server");
    const context = await authorizeRequest(new Request("http://127.0.0.1:3000/api/x", { headers: { cookie: await cookieHeaderFor(data.session!) } }), "ask_questions");
    expect(context.identity.subject).toBe(targetId);
  });

  it("the session function cannot be called by a signed-in user or anonymously", async () => {
    const { data } = await anonClient().auth.signInWithPassword({ email: CONTROL_EMAIL, password: CONTROL_PW });
    const asUser = await tokenClient(data.session!.access_token).rpc("auth_revoke_user_sessions", { p_user_id: controlId });
    const asAnon = await anonClient().rpc("auth_revoke_user_sessions", { p_user_id: controlId });
    expect(asUser.error).not.toBeNull();
    expect(asAnon.error).not.toBeNull();
    expect(Number(sql(`select count(*) from auth.sessions where user_id = '${controlId}'`))).toBeGreaterThan(0);
  });
});
