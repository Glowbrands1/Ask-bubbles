import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * REPORTING FRAMEWORK INVARIANTS.
 *
 * The reporting framework is one company-neutral migration: sources, files,
 * periods, ingestions and a metric vocabulary, with no report family of its
 * own. A family (its fact table, completion RPC and seed rows) arrives in a
 * migration of its own later. This suite reads the SQL and pins the properties
 * that are easy to lose in an edit: the relations are server-only, the
 * ingestion functions are not callable from a browser, and the lineage and
 * idempotency rules live in the database rather than only in the parser.
 *
 * Static checks over the migration text. Applying the migrations against a
 * real Postgres is `scripts/db/verify-migrations.sh`.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FRAMEWORK_FILE = "20260831000900_reporting_framework.sql";

const REPORTING_TABLES = [
  "report_sources",
  "report_files",
  "report_periods",
  "report_ingestions",
  "report_metrics",
] as const;

const INGESTION_FUNCTIONS = ["begin_report_ingestion", "fail_report_ingestion"] as const;

/** Strips `--` comments so prose cannot satisfy, or fail, an assertion. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: statementsOnly(readFileSync(join(MIGRATIONS_DIR, name), "utf8")) }));
}

const FRAMEWORK = statementsOnly(readFileSync(join(MIGRATIONS_DIR, FRAMEWORK_FILE), "utf8"));

describe("the reporting framework migration", () => {
  it("ships as one migration that creates every framework table", () => {
    for (const table of REPORTING_TABLES) {
      expect(FRAMEWORK, `${table} is created`).toContain(`create table public.${table} (`);
    }
    // No other migration creates a framework table a second time.
    for (const file of migrationFiles().filter((f) => f.name !== FRAMEWORK_FILE)) {
      for (const table of REPORTING_TABLES) {
        expect(file.sql, `${file.name} re-creates ${table}`).not.toContain(
          `create table public.${table} (`,
        );
      }
    }
  });

  it("carries no report family: no fact table, no completion RPC, no seeded metric", () => {
    expect(FRAMEWORK).not.toMatch(/create table public\.\w+_facts\b/);
    expect(FRAMEWORK).not.toMatch(/function public\.complete_\w+_ingestion/);
    expect(FRAMEWORK).not.toMatch(/insert into public\.report_(sources|metrics)\b/);
  });

  it("counts locations rather than any other kind of site", () => {
    expect(FRAMEWORK).toMatch(/location_count integer not null default 0/);
  });

  it("stays out of the knowledge domain", () => {
    expect(FRAMEWORK).not.toContain("knowledge_documents");
    expect(FRAMEWORK).not.toContain("knowledge_chunks");
  });
});

describe("the reporting relations are server-only", () => {
  it("enables AND forces row level security on every table", () => {
    for (const table of REPORTING_TABLES) {
      expect(FRAMEWORK).toContain(`alter table public.${table} enable row level security`);
      expect(FRAMEWORK).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("revokes every table from both browser roles", () => {
    for (const table of REPORTING_TABLES) {
      expect(FRAMEWORK).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
  });

  it("creates no policy and grants no browser role anything", () => {
    expect(FRAMEWORK).not.toContain("create policy");
    expect(FRAMEWORK).not.toMatch(/grant [^;]* to [^;]*\b(anon|authenticated)\b/);
  });

  it("is never re-granted to a browser role by a later migration", () => {
    for (const file of migrationFiles().filter((f) => f.name > FRAMEWORK_FILE)) {
      for (const table of REPORTING_TABLES) {
        const grant = new RegExp(`grant [^;]*on [^;]*public\\.${table}\\b[^;]* to [^;]*\\b(anon|authenticated)\\b`);
        expect(file.sql, `${file.name} grants ${table} to a browser role`).not.toMatch(grant);
        expect(file.sql, `${file.name} adds a policy on ${table}`).not.toMatch(
          new RegExp(`create policy [^;]* on public\\.${table}\\b`),
        );
      }
    }
  });

  it("keeps the reporting bucket private and separate from knowledge documents", () => {
    const bucket = /insert into storage\.buckets[^;]*values \( 'reporting-sources', 'reporting-sources', (true|false)/.exec(
      FRAMEWORK,
    );
    expect(bucket, "the reporting bucket is created").not.toBeNull();
    expect((bucket as RegExpExecArray)[1]).toBe("false");
    expect(FRAMEWORK).not.toMatch(/create policy [^;]* on storage\.objects/);
  });
});

describe("ingestion functions are not callable by browser roles", () => {
  it("revokes execute from public, anon and authenticated, and grants only the service role", () => {
    for (const name of INGESTION_FUNCTIONS) {
      expect(FRAMEWORK).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`),
      );
      expect(FRAMEWORK).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`),
      );
    }
  });

  it("pins search_path and never runs as SECURITY DEFINER", () => {
    for (const name of INGESTION_FUNCTIONS) {
      const at = FRAMEWORK.indexOf(`create or replace function public.${name}(`);
      expect(at, `${name} is defined`).toBeGreaterThanOrEqual(0);
      const header = FRAMEWORK.slice(at, FRAMEWORK.indexOf("$$", at));
      expect(header, `${name} pins search_path`).toContain("set search_path = ''");
      expect(header, `${name} is security definer`).not.toContain("security definer");
    }
  });
});

describe("idempotency and lineage live in the database", () => {
  it("makes file content identity unique and delivery identity unique only where present", () => {
    expect(FRAMEWORK).toContain("constraint report_files_sha256_key unique (file_sha256)");
    expect(FRAMEWORK).toMatch(
      /create unique index report_files_source_message_key on public\.report_files \(source_id, external_message_id\) where external_message_id is not null/,
    );
  });

  it("allows at most one succeeded attempt per file, parser and version", () => {
    expect(FRAMEWORK).toMatch(
      /create unique index report_ingestions_one_success_key on public\.report_ingestions \(file_id, parser_key, parser_version\) where status = 'succeeded'/,
    );
  });

  it("refuses a success without evidence and a failure without a reason", () => {
    expect(FRAMEWORK).toContain("constraint report_ingestions_succeeded_requires_period");
    expect(FRAMEWORK).toContain("check (status <> 'failed' or failure_reason is not null)");
  });

  it("keeps the lineage chain unbroken by foreign key", () => {
    expect(FRAMEWORK).toContain("source_id uuid not null references public.report_sources (id)");
    expect(FRAMEWORK).toContain("file_id uuid not null references public.report_files (id)");
    expect(FRAMEWORK).toContain("period_id uuid references public.report_periods (id)");
  });

  it("keeps each reporting period independently addressable", () => {
    expect(FRAMEWORK).toContain("constraint report_periods_grain_end_key unique (grain, period_end)");
  });

  it("never lets a failure overwrite a succeeded attempt", () => {
    const at = FRAMEWORK.indexOf("create or replace function public.fail_report_ingestion(");
    const body = FRAMEWORK.slice(at, FRAMEWORK.indexOf("end; $$", at));
    expect(body).toContain("and status <> 'succeeded'");
  });
});

describe("ingestion statuses stay inside the enum", () => {
  const declaration = /create type public\.report_ingestion_status as enum \(([^)]*)\)/.exec(FRAMEWORK);
  const statuses = declaration ? [...declaration[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];

  it("declares the statuses the functions use", () => {
    expect(statuses).toEqual(
      expect.arrayContaining(["received", "parsing", "succeeded", "failed", "rejected_duplicate"]),
    );
  });

  it("writes and compares only declared statuses", () => {
    let checked = 0;
    for (const name of INGESTION_FUNCTIONS) {
      const at = FRAMEWORK.indexOf(`create or replace function public.${name}(`);
      const body = FRAMEWORK.slice(at, FRAMEWORK.indexOf("end; $$", at));
      for (const match of body.matchAll(/status\s*(?:=|<>|!=)\s*'([a-z_]+)'/g)) {
        checked += 1;
        expect(statuses, `${name} uses status "${match[1]}"`).toContain(match[1]);
      }
    }
    expect(checked, "status literals were actually found").toBeGreaterThan(2);
  });

  it("opens an attempt in the parsing state and records its source", () => {
    const at = FRAMEWORK.indexOf("insert into public.report_ingestions (");
    expect(at).toBeGreaterThanOrEqual(0);
    const insert = FRAMEWORK.slice(at, FRAMEWORK.indexOf("returning", at));
    expect(insert).toContain("source_id");
    expect(insert).toContain("'parsing'");
  });
});
