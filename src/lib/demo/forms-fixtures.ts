import { isHiddenTemplate } from "@/config/company/forms/hidden";
import { businessToday, shiftDays } from "@/lib/business-date";
import type { InstanceRow, InstanceSource, InstanceStatus } from "@/lib/forms/instances";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";
import { COMPANY_LOCATIONS, locationByCode } from "@/lib/locations";
import { demoFormVisible } from "./demo-scope";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { Permission, Role, ScopeLevel } from "@/types";

/**
 * ============================================================================
 * FORMS REGISTER — INVENTED DEMO RECORDS (NEXT_PUBLIC_DEMO_MODE=true ONLY)
 * ============================================================================
 *
 * Every employee here is invented (the same invented people the Woven sample
 * uses, plus a few more). The stores are the configured roster; the templates
 * are the real template keys from `TEMPLATE_SEEDS`, so a demo row names a form
 * the live library actually offers.
 *
 * Dates are written as offsets from the business day the page is rendered on,
 * so "overdue" and "due this week" stay true whatever day the demo is opened.
 *
 * The demo keeps what a viewer does to these rows (archive, follow-up done,
 * delete a draft) in this server process's memory, so the buttons behave; a
 * restart puts the set back. Nothing here is written to a database.
 */

interface DemoFormSpec {
  key: string;
  employee: string;
  jobTitle: string;
  store: string;
  createdBy: string;
  createdByRole: Role;
  source: InstanceSource;
  status: InstanceStatus;
  /** Days before today the form is dated. */
  daysAgo: number;
  /** Follow-up date as days from today (negative = in the past). */
  followUp?: number;
  /** Days before today the follow-up was marked done. */
  followedUpDaysAgo?: number;
  archivedDaysAgo?: number;
  variant?: string;
  /** Index (1-based) of the demo form this one revises. */
  revises?: number;
}

const SM = "Demo Location Manager";
const AM = "Demo Assistant Manager";
const DM = "Demo District Manager";
const RM = "Demo Regional Manager";
const OWNER = "Demo Owner";

const SPECS: DemoFormSpec[] = [
  { key: "dpoa", employee: "Marisol Quintero", jobTitle: "Team Member", store: "264", createdBy: SM, createdByRole: "location_manager", source: "assistant", status: "finalized", daysAgo: 12, followUp: -3 },
  { key: "coaching", employee: "Jonah Brightwater", jobTitle: "Soap Maker", store: "264", createdBy: AM, createdByRole: "assistant_manager", source: "assistant", status: "finalized", daysAgo: 6, followUp: 2 },
  { key: "dpoa", employee: "Delphine Harrow", jobTitle: "Shift Lead", store: "67", createdBy: DM, createdByRole: "district_manager", source: "assistant", status: "finalized", daysAgo: 9, followUp: 0, revises: 25 },
  { key: "follow-up-coaching", employee: "Priyanka Sorensen", jobTitle: "Makery Associate", store: "236", createdBy: SM, createdByRole: "location_manager", source: "manual", status: "finalized", daysAgo: 4, followUp: 10 },
  { key: "policy-review", employee: "Callum Ashdown", jobTitle: "Team Member", store: "66", createdBy: DM, createdByRole: "district_manager", source: "assistant", status: "finalized", daysAgo: 21, followUp: -8 },
  { key: "coaching", employee: "Theo Vantongeren", jobTitle: "Team Member", store: "219", createdBy: RM, createdByRole: "regional_manager", source: "assistant", status: "draft", daysAgo: 1 },
  { key: "dpoa", employee: "Rosalind Okafor", jobTitle: "Soap Maker", store: "225", createdBy: RM, createdByRole: "regional_manager", source: "assistant", status: "draft", daysAgo: 0 },
  { key: "demotion", employee: "Emeric Lindqvist", jobTitle: "Shift Lead", store: "338", createdBy: OWNER, createdByRole: "owner", source: "manual", status: "finalized", daysAgo: 15 },
  { key: "position-transfer", employee: "Beatrix Mallory", jobTitle: "Assistant Manager", store: "264", createdBy: DM, createdByRole: "district_manager", source: "manual", status: "finalized", daysAgo: 18 },
  { key: "resignation-exit", employee: "Ignatius Pell", jobTitle: "Team Member", store: "236", createdBy: DM, createdByRole: "district_manager", source: "assistant", status: "finalized", daysAgo: 11 },
  { key: "prescreen-phone-interview", employee: "Wren Castellano", jobTitle: "Team Member (candidate)", store: "219", createdBy: SM, createdByRole: "location_manager", source: "manual", status: "finalized", daysAgo: 3 },
  { key: "coaching", employee: "Odessa Farthing", jobTitle: "Makery Associate", store: "67", createdBy: AM, createdByRole: "assistant_manager", source: "assistant", status: "finalized", daysAgo: 27, followUp: -13, followedUpDaysAgo: 12 },
  { key: "dpoa", employee: "Lucan Whitlock", jobTitle: "Team Member", store: "225", createdBy: RM, createdByRole: "regional_manager", source: "assistant", status: "finalized", daysAgo: 8, followUp: 4 },
  { key: "coaching", employee: "Saoirse Pennington", jobTitle: "Soap Maker", store: "338", createdBy: RM, createdByRole: "regional_manager", source: "assistant", status: "finalized", daysAgo: 16, followUp: -1 },
  { key: "tsd-epp", employee: "Anouk Delacroix-Bell", jobTitle: "Store Manager", store: "66", createdBy: DM, createdByRole: "district_manager", source: "manual", status: "finalized", daysAgo: 24, followUp: 6 },
  { key: "sdit-epp", employee: "Tobiah Renshaw", jobTitle: "Assistant Manager", store: "264", createdBy: DM, createdByRole: "district_manager", source: "manual", status: "draft", daysAgo: 2 },
  { key: "dpoa", employee: "Marisol Quintero", jobTitle: "Team Member", store: "264", createdBy: SM, createdByRole: "location_manager", source: "assistant", status: "finalized", daysAgo: 48, followUp: -34, followedUpDaysAgo: 33 },
  { key: "follow-up-coaching", employee: "Jonah Brightwater", jobTitle: "Soap Maker", store: "264", createdBy: AM, createdByRole: "assistant_manager", source: "assistant", status: "finalized", daysAgo: 30, followUp: -16, followedUpDaysAgo: 15 },
  { key: "coaching", employee: "Fenella Ostrowski", jobTitle: "Team Member", store: "236", createdBy: SM, createdByRole: "location_manager", source: "assistant", status: "finalized", daysAgo: 5, followUp: 3 },
  { key: "dpoa", employee: "Bartholomew Achebe-Lund", jobTitle: "Makery Associate", store: "219", createdBy: RM, createdByRole: "regional_manager", source: "assistant", status: "finalized", daysAgo: 19, followUp: -5 },
  { key: "policy-review", employee: "Imogen Sutcliffe-Rao", jobTitle: "Shift Lead", store: "225", createdBy: RM, createdByRole: "regional_manager", source: "manual", status: "finalized", daysAgo: 7, followUp: 7 },
  { key: "coaching", employee: "Callum Ashdown", jobTitle: "Team Member", store: "66", createdBy: DM, createdByRole: "district_manager", source: "assistant", status: "finalized", daysAgo: 62, archivedDaysAgo: 30, followUp: -48, followedUpDaysAgo: 47 },
  { key: "dpoa", employee: "Theo Vantongeren", jobTitle: "Team Member", store: "219", createdBy: RM, createdByRole: "regional_manager", source: "assistant", status: "finalized", daysAgo: 75, archivedDaysAgo: 40, followUp: -61, followedUpDaysAgo: 60 },
  { key: "resignation-exit", employee: "Percival Oyelaran", jobTitle: "Soap Maker", store: "338", createdBy: OWNER, createdByRole: "owner", source: "manual", status: "finalized", daysAgo: 55, archivedDaysAgo: 20 },
  { key: "dpoa", employee: "Delphine Harrow", jobTitle: "Shift Lead", store: "67", createdBy: DM, createdByRole: "district_manager", source: "assistant", status: "revised", daysAgo: 10 },
  { key: "coaching", employee: "Wilhelmina Cardew", jobTitle: "Makery Associate", store: "66", createdBy: DM, createdByRole: "district_manager", source: "assistant", status: "draft", daysAgo: 0 },
];

/** A stable, well-formed UUID per demo row, so `/forms/monitoring/<id>` routes parse it. */
export function demoFormId(index: number): string {
  return `d3e0f0a0-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function isDemoFormId(id: string): boolean {
  return /^d3e0f0a0-0000-4000-8000-\d{12}$/.test(id);
}

interface DemoOverride {
  archivedAt?: string | null;
  followUpDate?: string | null;
  followedUpAt?: string | null;
  followedUpBy?: string | null;
  exportedAt?: string | null;
  deleted?: boolean;
}

const STORE_KEY = "__askBubblesDemoFormOverrides";
function overrides(): Map<string, DemoOverride> {
  const holder = globalThis as unknown as Record<string, Map<string, DemoOverride> | undefined>;
  holder[STORE_KEY] ??= new Map();
  return holder[STORE_KEY]!;
}

function at(day: string, hour = 15): string {
  return `${day}T${String(hour).padStart(2, "0")}:12:00.000Z`;
}

function buildRow(spec: DemoFormSpec, index: number, today: string): InstanceRow {
  const seed = TEMPLATE_SEEDS.find((entry) => entry.key === spec.key);
  if (!seed) throw new Error(`Demo forms name an unknown template: ${spec.key}`);
  const location = locationByCode(spec.store);
  const formDate = shiftDays(today, -spec.daysAgo);
  const finalized = spec.status !== "draft";
  const id = demoFormId(index);
  const row: InstanceRow = {
    id,
    templateId: `demo-template-${seed.key}`,
    templateKey: seed.key,
    templateName: seed.name,
    templateShortName: seed.shortName,
    layoutFamily: seed.layoutFamily,
    templateVersionId: `demo-version-${seed.key}-${seed.revision}`,
    templateVersion: seed.revision,
    variantKey: spec.variant ?? seed.variants[0]?.key ?? null,
    employeeName: spec.employee,
    employeeRole: spec.jobTitle,
    locationId: location?.id ?? null,
    locationName: location?.name ?? null,
    createdBy: spec.createdBy,
    createdByRole: spec.createdByRole,
    source: spec.source,
    status: spec.status,
    formDate,
    followUpDate: spec.followUp === undefined ? null : shiftDays(today, spec.followUp),
    followedUpAt:
      spec.followedUpDaysAgo === undefined ? null : at(shiftDays(today, -spec.followedUpDaysAgo), 17),
    followedUpBy: spec.followedUpDaysAgo === undefined ? null : spec.createdBy,
    finalizedAt: finalized ? at(formDate, 16) : null,
    exportedAt: finalized && index % 3 === 0 ? at(formDate, 18) : null,
    archivedAt: spec.archivedDaysAgo === undefined ? null : at(shiftDays(today, -spec.archivedDaysAgo), 14),
    revisesInstanceId: spec.revises ? demoFormId(spec.revises - 1) : null,
    createdAt: at(formDate, 14),
    updatedAt: at(formDate, finalized ? 16 : 14),
  };
  const change = overrides().get(id);
  return change ? { ...row, ...stripDeleted(change) } : row;
}

function stripDeleted(change: DemoOverride): Partial<InstanceRow> {
  const { deleted: _deleted, ...rest } = change;
  void _deleted;
  return rest;
}

/** Every demo form, with this process's demo changes applied. Newest first. */
export function allDemoForms(today: string = businessToday()): InstanceRow[] {
  return SPECS.map((spec, index) => buildRow(spec, index, today))
    .filter((row) => !overrides().get(row.id)?.deleted)
    .filter((row) => !isHiddenTemplate(row.templateKey))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface DemoViewer {
  role: Role | null;
  scopeLevel: ScopeLevel | null;
}

/**
 * The demo forms a viewer would see live: their stores only, and a family that
 * needs a creation permission to read (the exit form) only for a role holding it.
 * The Forms Register applies the same rule in the browser (`demoFormVisible`),
 * where the previewed role is known.
 */
export function demoFormsFor(
  viewer: DemoViewer,
  view: "active" | "archived" | "all" = "active",
  today: string = businessToday(),
): InstanceRow[] {
  const can = (permission: Permission) =>
    viewer.role === null || hasPermission(DEFAULT_PERMISSION_MATRIX, viewer.role, permission);
  return allDemoForms(today).filter((row) => {
    if (view === "active" && row.archivedAt) return false;
    if (view === "archived" && !row.archivedAt) return false;
    return demoFormVisible(row, viewer.scopeLevel, can);
  });
}

export function findDemoForm(id: string, today: string = businessToday()): InstanceRow | null {
  return allDemoForms(today).find((row) => row.id === id) ?? null;
}

/* ------------------------------------------------------------- writes --- */

export class DemoFormRefusal extends Error {}

function change(id: string, patch: DemoOverride): InstanceRow {
  const row = findDemoForm(id);
  if (!row) throw new DemoFormRefusal("That form was not found.");
  overrides().set(id, { ...overrides().get(id), ...patch });
  return findDemoForm(id)!;
}

export function demoArchive(id: string, archived: boolean): InstanceRow {
  return change(id, { archivedAt: archived ? new Date().toISOString() : null });
}

export function demoDelete(id: string): InstanceRow {
  const row = findDemoForm(id);
  if (!row) throw new DemoFormRefusal("That form was not found.");
  if (row.status !== "draft") {
    throw new DemoFormRefusal("This form is finalized, so it cannot be deleted. Archive it instead — the record is kept.");
  }
  overrides().set(id, { ...overrides().get(id), deleted: true });
  return row;
}

export function demoSetFollowUp(id: string, date: string): InstanceRow {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DemoFormRefusal("That is not a date.");
  return change(id, { followUpDate: date, followedUpAt: null, followedUpBy: null });
}

export function demoFollowUpDone(id: string, by: string, done: boolean): InstanceRow {
  return change(id, done ? { followedUpAt: new Date().toISOString(), followedUpBy: by } : { followedUpAt: null, followedUpBy: null });
}

export function demoMarkExported(id: string): void {
  change(id, { exportedAt: new Date().toISOString() });
}

/** Restores the untouched set — for tests. */
export function resetDemoForms(): void {
  overrides().clear();
}

/** The roster codes the demo spreads its forms across (all of them). */
export const DEMO_FORM_STORES = COMPANY_LOCATIONS.map((location) => location.code);
