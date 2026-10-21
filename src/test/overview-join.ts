import type { FakeStore } from "./fake-supabase";

/**
 * ============================================================================
 * THE OVERVIEW VIEW'S JOIN, APPLIED AS ROWS ARE READ
 * ============================================================================
 *
 * `form_instance_overview` reads `form_instances` joined to `form_templates`
 * and `form_template_versions` (see 20260904004000_forms_follow_up_tracking.sql:
 * `t.key as template_key`, `t.name as template_name`, `t.layout_family`,
 * `v.version`). The fake reads the bare table, so the e2e suites add those
 * columns with a `joinOverview()` between requests.
 *
 * That gap is too wide for a chat turn that INSERTS a form and then reads it
 * back in the same call — the new draft a correction opens on a finalized
 * form (`editable-draft.ts`) — so this joins every row as it is read, the way
 * the view would. Ported from the reference platform's revision e2e test.
 *
 * Usage: `store.form_instances = joinedOnRead(store, "2026-09-28")`, after the
 * store is cleared; the fake's inserts and deletes keep working on it.
 */
export function joinedOnRead(store: FakeStore, formDate: string): FakeStore["form_instances"] {
  return new Proxy([] as FakeStore["form_instances"], {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property === "string" && /^\d+$/.test(property) && value) {
        const row = value as Record<string, unknown>;
        const template = (store.form_templates ?? []).find((entry) => entry.id === row.template_id);
        const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
        Object.assign(row, {
          // The column default the fake does not apply: `form_date date not null default current_date`.
          form_date: row.form_date ?? formDate,
          template_key: template?.key,
          template_name: template?.name,
          layout_family: template?.layout_family,
          template_version: version?.version,
        });
      }
      return value;
    },
  });
}
