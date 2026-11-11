import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMigratedTestDatabase, type KnowledgeTestDatabase } from "@/test/pglite-knowledge-db";

/**
 * THE AUTO SYNC SETTING ON A REAL POSTGRES (PGlite), running the repository's own
 * migration and rollback verbatim.
 *
 * The employee directory migration needs platform objects PGlite does not have, so
 * the two tables the function READS are stood in by minimal stubs (a status column,
 * and a table that is either empty or not). The setting's own SQL is the real file.
 */

const read = (path: string) => readFileSync(new URL(`../../../../supabase/${path}`, import.meta.url), "utf8");
const UP = read("migrations/20261014001000_woven_auto_sync_setting.sql");
const DOWN = read("rollbacks/20261014001000_woven_auto_sync_setting_down.sql");

let t: KnowledgeTestDatabase;
beforeEach(async () => {
  t = await createMigratedTestDatabase(["20260829000100_extensions", "20260829000200_knowledge_schema"]);
  await t.db.exec(`
    create table public.employee_sync_runs (id serial primary key, status text not null);
    create table public.employee_access_directory (id serial primary key);
  `);
  await t.db.exec(UP);
});
afterEach(async () => {
  await t.close();
});

const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows;
const setAuto = (enabled: boolean, actor = "admin:a@example.test") => q<{ r: { enabled: boolean; changed: boolean } }>(`select public.employee_sync_set_auto($1, $2) as r`, [enabled, actor]);
const enabledNow = async () => (await q<{ auto_sync_enabled: boolean }>(`select auto_sync_enabled from public.employee_sync_settings`))[0]!.auto_sync_enabled;
const savedDirectory = () => t.db.exec(`insert into public.employee_sync_runs (status) values ('succeeded'); insert into public.employee_access_directory default values;`);

describe("the Auto Sync setting", () => {
  it("applying the migration schedules nothing: one row, OFF", async () => {
    expect(await q(`select * from public.employee_sync_settings`)).toHaveLength(1);
    expect(await enabledNow()).toBe(false);
  });

  it("cannot be turned ON before a directory is saved — the database refuses, whatever calls it", async () => {
    await expect(setAuto(true)).rejects.toThrow(/auto_sync_requires_saved_directory/);
    await t.db.exec(`insert into public.employee_sync_runs (status) values ('failed'), ('rejected')`);
    await expect(setAuto(true)).rejects.toThrow(/auto_sync_requires_saved_directory/);
    await t.db.exec(`insert into public.employee_sync_runs (status) values ('succeeded')`);
    await expect(setAuto(true)).rejects.toThrow(/auto_sync_requires_saved_directory/); // a succeeded run but an empty directory
    expect(await enabledNow()).toBe(false);
  });

  it("turns ON once a stored sync succeeded and the directory has employees; OFF always works", async () => {
    await savedDirectory();
    expect((await setAuto(true))[0]!.r).toEqual({ enabled: true, changed: true });
    expect(await enabledNow()).toBe(true);
    expect((await setAuto(true))[0]!.r).toEqual({ enabled: true, changed: false });
    expect((await setAuto(false))[0]!.r).toEqual({ enabled: false, changed: true });
    expect(await enabledNow()).toBe(false);
  });

  it("OFF works even when nothing has ever been saved", async () => {
    expect((await setAuto(false))[0]!.r).toEqual({ enabled: false, changed: false });
  });

  it("records who changed it, and only real changes, in an append-only audit", async () => {
    await savedDirectory();
    await setAuto(true, "admin:first@example.test");
    await setAuto(true, "admin:second@example.test"); // no change: no audit row
    await setAuto(false, "admin:third@example.test");
    const rows = await q<{ actor: string; from_enabled: boolean; to_enabled: boolean }>(`select actor, from_enabled, to_enabled from public.employee_sync_setting_audit order by id`);
    expect(rows).toEqual([
      { actor: "admin:first@example.test", from_enabled: false, to_enabled: true },
      { actor: "admin:third@example.test", from_enabled: true, to_enabled: false },
    ]);
    await expect(t.db.exec(`update public.employee_sync_setting_audit set actor = 'x'`)).rejects.toThrow(/append-only/);
    await expect(t.db.exec(`delete from public.employee_sync_setting_audit`)).rejects.toThrow(/append-only/);
  });

  it("rejects a missing actor or a null flag", async () => {
    await expect(setAuto(false, "  ")).rejects.toThrow(/actor is required/);
    await expect(q(`select public.employee_sync_set_auto(null, 'x')`)).rejects.toThrow(/enabled must be/);
  });

  it("is a single row and pinned to Midwest Soap Makers", async () => {
    await expect(t.db.exec(`insert into public.employee_sync_settings (singleton) values (false)`)).rejects.toThrow();
    await expect(t.db.exec(`insert into public.employee_sync_settings (singleton) values (true)`)).rejects.toThrow();
    await expect(t.db.exec(`update public.employee_sync_settings set woven_company_id = '11111111-2222-4333-8444-555555555555'`)).rejects.toThrow();
  });

  it("nothing is granted to the public API roles", async () => {
    const grants = await q<{ grantee: string }>(
      `select grantee from information_schema.role_table_grants where table_schema = 'public' and table_name in ('employee_sync_settings','employee_sync_setting_audit') and grantee in ('anon','authenticated','public')`,
    );
    expect(grants).toEqual([]);
  });

  it("the rollback removes only its own objects and is idempotent", async () => {
    await t.db.exec(DOWN);
    await t.db.exec(DOWN);
    expect(await q(`select to_regclass('public.employee_sync_settings') as r`)).toEqual([{ r: null }]);
    expect(await q(`select to_regclass('public.employee_sync_setting_audit') as r`)).toEqual([{ r: null }]);
    expect(await q(`select to_regclass('public.employee_sync_runs') as r`)).not.toEqual([{ r: null }]);
  });
});
