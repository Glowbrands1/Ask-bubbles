import { PINNED_COMPANY_ID } from "./config";
import { EMPTY_GUID, FIELD, LOCATION_FIELD } from "./contract";

/**
 * ============================================================================
 * EVERY RECORD'S COMPANY — Midwest Soap Makers, or the run stops
 * ============================================================================
 *
 * The token guard (`client.ts`) proves Woven ISSUED the token for the pinned
 * company. This proves every RECORD Woven then returns belongs to it too:
 * each `Employee` (all three list reads), each `EmployeeDetail` and every
 * `EmployeeLocationAccess` in its `Locations[]`, and each `Location` from
 * `GET /locations`. The spec puts `CompanyID` on all of them.
 *
 * ANY DOUBT STOPS THE RUN, before anything is committed:
 *
 *   mismatch  a record names another company. Never dropped and carried on:
 *             a foreign record means the token reaches further than proved.
 *   missing   a record names no company (absent, not a GUID, the all-zero
 *             GUID). Never assumed to be the pinned one.
 *
 * A non-object entry is not checked here: it carries no company and no
 * employee data, and the normaliser already refuses it.
 *
 * Messages carry the record kind and the outcome only — never an employee id,
 * a name or the other company's id.
 */

export type CompanyScopedKind = "employee" | "employee_detail" | "employee_location" | "location";

export type CompanyScopeProblem = "mismatch" | "missing";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABEL: Record<CompanyScopedKind, string> = {
  employee: "An employee record",
  employee_detail: "An employee-details record",
  employee_location: "A location on an employee-details record",
  location: "A location record",
};

export class CompanyScopeError extends Error {
  readonly code: `company_scope_${CompanyScopeProblem}`;
  readonly kind: CompanyScopedKind;
  readonly problem: CompanyScopeProblem;
  constructor(kind: CompanyScopedKind, problem: CompanyScopeProblem) {
    super(
      problem === "mismatch"
        ? `${KIND_LABEL[kind]} from Woven belongs to another company, not the pinned Buff City Soap company (Midwest Soap Makers). Nothing was saved.`
        : `${KIND_LABEL[kind]} from Woven named no company, so it could not be proved to be Midwest Soap Makers. Nothing was saved.`,
    );
    this.name = "CompanyScopeError";
    this.code = `company_scope_${problem}`;
    this.kind = kind;
    this.problem = problem;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The record's `CompanyID`, lower-cased, or null when it names none. */
export function readRecordCompanyId(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) continue;
    const value = record[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!GUID.test(trimmed) || trimmed === EMPTY_GUID) return null;
    return trimmed.toLowerCase();
  }
  return null;
}

/** Throws `CompanyScopeError` unless an object record names exactly the pinned company. */
export function assertRecordCompany(record: unknown, kind: CompanyScopedKind): void {
  if (!isRecord(record)) return;
  const keys = kind === "employee" || kind === "employee_detail" ? FIELD.companyId : LOCATION_FIELD.companyId;
  const companyId = readRecordCompanyId(record, keys);
  if (companyId === null) throw new CompanyScopeError(kind, "missing");
  if (companyId !== PINNED_COMPANY_ID) throw new CompanyScopeError(kind, "mismatch");
}

/**
 * An employee-details body: the record itself, then every entry of its
 * `Locations[]`. A details body that is not an object proves nothing either
 * way and is left to the normaliser, which reads no locations from it.
 */
export function assertDetailsCompany(details: unknown): void {
  if (!isRecord(details)) return;
  assertRecordCompany(details, "employee_detail");
  const locations = FIELD.locations.map((key) => details[key]).find((value) => value !== undefined);
  if (!Array.isArray(locations)) return;
  for (const entry of locations) assertRecordCompany(entry, "employee_location");
}
