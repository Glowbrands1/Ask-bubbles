import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { createMigratedTestDatabase } from "@/test/pglite-knowledge-db";

/**
 * Pau, 23 Nov 2026: "the archived should not be acknowledged as a form, all just should be finalized or drafted."
 * The migration clears `archived_at` and records an 'unarchived' event per row, on the real schema (PGlite). The
 * one-open-revision index leaves an archived revision draft out, so a row that would collide with it is skipped, not
 * allowed to fail the migration.
 */
let harness: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

const TEMPLATE = "00000000-0000-4000-8000-000000000001";
const VERSION = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-8000-00000000a${String(n).padStart(3, "0")}`;

beforeAll(async () => {
  harness = await createMigratedTestDatabase(
    [
      "20260904001000_forms_engine",
      "20260904003000_forms_instance_archive",
      "20260904003100_forms_event_kind_archive",
      "20260904004000_forms_follow_up_tracking",
      "20261025233000_form_instances_one_open_revision",
      "20261110201714_form_instances_one_open_revision_not_archived",
    ],
    {
      platform: `
        create extension if not exists pgcrypto with schema extensions;
        create function public.touch_updated_at() returns trigger language plpgsql as $$
        begin new.updated_at := now(); return new; end; $$;
      `,
    },
  );
  await harness.db.exec(`
    insert into public.form_templates (id, key, name, short_name, layout_family, required_permission)
    values ('${TEMPLATE}', 'dpoa', 'Corrective Action Form', 'CA',
      (select enum_range(null::public.form_layout_family))[1], 'create_corrective_action');
    insert into public.form_template_versions (id, template_id, version, document)
    values ('${VERSION}', '${TEMPLATE}', 1, '{}'::jsonb);
  `);
}, 60_000);

afterAll(async () => harness?.close());

const form = (n: number, status: string, archived: boolean, revises?: number) => `
  insert into public.form_instances (id, template_id, template_version_id, employee_name, location_id, location_name, created_by, status, form_date, archived_at, revises_instance_id, created_at, finalized_at)
  values ('${id(n)}', '${TEMPLATE}', '${VERSION}', 'Odessa Quill', 'loc-test', 'Test Store', 'manager-a', '${status}', '2026-11-17',
    ${archived ? "'2026-11-18T10:00:00Z'" : "null"}, ${revises ? `'${id(revises)}'` : "null"}, '2026-11-17T10:00:0${n % 10}Z',
    ${status === "finalized" ? "'2026-11-17T11:00:00Z'" : "null"});`;

describe("20261124001000_forms_unarchive", () => {
  it("clears archived_at, records one 'unarchived' event per row, and never moves a form between Draft and Finalized", async () => {
    await harness.db.exec(
      form(1, "finalized", true) + form(2, "draft", true) + form(3, "draft", false) +
      // An archived revision draft with another draft of the same form open: the index would refuse it.
      form(4, "finalized", false) + form(5, "draft", true, 4) + form(6, "draft", false, 4) +
      // Two archived revision drafts of one form, none open: one of them is cleared.
      form(7, "finalized", false) + form(8, "draft", true, 7) + form(9, "draft", true, 7),
    );
    const sql = readFileSync("supabase/migrations/20261124001000_forms_unarchive.sql", "utf8");
    await harness.db.exec(sql);

    const archived = (await harness.db.query<{ id: string }>("select id from public.form_instances where archived_at is not null order by id")).rows.map((row) => row.id);
    // Skipped, not failed: the archived draft that collides with an open one (5), and one of the two archived drafts of form 7 (8 or 9).
    expect(archived).toHaveLength(2);
    expect(archived).toContain(id(5));
    expect(archived.filter((one) => one === id(8) || one === id(9))).toHaveLength(1);

    const events = (await harness.db.query<{ instance_id: string }>("select instance_id from public.form_instance_events where kind = 'unarchived'")).rows.map((row) => row.instance_id);
    expect(events.sort()).toEqual([id(1), id(2), id(8), id(9)].filter((one) => !archived.includes(one)).sort());

    const statuses = (await harness.db.query<{ id: string; status: string }>("select id, status from public.form_instances where id in ($1, $2)", [id(1), id(2)])).rows;
    expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({ [id(1)]: "finalized", [id(2)]: "draft" });
  });

  it("is idempotent: a second run changes nothing", async () => {
    const before = (await harness.db.query<{ n: string }>("select count(*)::text as n from public.form_instance_events where kind = 'unarchived'")).rows[0].n;
    const sql = readFileSync("supabase/migrations/20261124001000_forms_unarchive.sql", "utf8");
    await harness.db.exec(sql);
    const after = (await harness.db.query<{ n: string }>("select count(*)::text as n from public.form_instance_events where kind = 'unarchived'")).rows[0].n;
    expect(after).toBe(before);
  });
});
