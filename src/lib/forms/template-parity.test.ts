import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import approved from "@/test/fixtures/approved-template-changes.json";
import snapshot from "@/test/fixtures/ask-sunny-published-templates.json";

import { APPROVED_REMOVAL_DESCRIPTION_CHANGES, APPROVED_REMOVALS, withApprovedRemovals } from "@/test/approved-removals";

import { RETIRED_TEMPLATE_KEYS } from "@/config/company/forms/retired";

import { MIGRATED_TEMPLATE_SEEDS, TEMPLATE_SEEDS } from "./library";
import { CA_ACTION_PLAN_CLOSING, CA_ACTION_PLAN_CLOSING_REVISION_5 } from "./required-closing";

/**
 * ============================================================================
 * THE MIGRATED LIBRARY IS THE REFERENCE PLATFORM'S PUBLISHED LIBRARY
 * ============================================================================
 *
 * `ask-sunny-published-templates.json` is the current published version of
 * every template in the reference platform's database, read on 8 Oct 2026.
 * Each entry carries the database's own fingerprint of that version
 * (`md5(document::text)`), and the first test recomputes it, so the snapshot
 * cannot drift from what was published.
 *
 * The second test compares every migrated seed with its snapshot, field by
 * field, and requires the differences to be EXACTLY the approved list — no
 * more, no fewer. The third requires each approved difference to be one of
 * the changes the business authorized: company branding, the source app's
 * name, the removed logo, and the exit form's key and description. A wording
 * change anywhere else fails here.
 */

interface SnapshotTemplate {
  key: string;
  publishedVersion: number;
  documentMd5: string;
  variantsMd5: string;
  document: unknown;
  variants: unknown;
  [field: string]: unknown;
}

interface ApprovedChange {
  sourceKey: string;
  path: string;
  from: unknown;
  to: unknown;
}

/*
 * Templates in the reference snapshot that this library deliberately no longer ships. The Tanning Consultant Interview
 * is the sibling company's own role: removed from the library and its key retired (Pau, via QA, 21 Nov 2026). The
 * snapshot and the approved-changes fixture are records of the reference platform and stay whole; the comparisons
 * below set the removed template aside, and a test requires it to be absent from the seeds and retired.
 */
/*
 * Empty since 23 Nov 2026 (Pau, via QA: "ok all ur picks"): the consultant interview removed on 21 Nov is back as Buff
 * City Soap's Team Member Interview Form, under its old key. CHANGED ON PURPOSE.
 */
const REMOVED_FROM_LIBRARY: readonly string[] = [];

const SNAPSHOT_TEMPLATES = snapshot.templates as unknown as SnapshotTemplate[];
const ALL_CHANGES = approved.changes as ApprovedChange[];
const TEMPLATES = SNAPSHOT_TEMPLATES.filter((template) => !REMOVED_FROM_LIBRARY.includes(template.key));
const CHANGES = ALL_CHANGES.filter((change) => !REMOVED_FROM_LIBRARY.includes(change.sourceKey));

/** Postgres's text form of a jsonb value: keys by length then bytes, ", " and ": ". */
function jsonbText(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => {
      const left = Buffer.from(a);
      const right = Buffer.from(b);
      return left.length - right.length || Buffer.compare(left, right);
    });
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${jsonbText(v)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

const md5 = (value: unknown) => createHash("md5").update(jsonbText(value)).digest("hex");

/**
 * The payroll amount line is in the Corrective Action seed and is not part of
 * the published snapshot. It is not published to the database from this
 * change (the live template stays version 2 until that is approved), so the
 * parity comparison sets it aside and a separate test checks its place.
 */
function withoutUnpublishedPayrollAmount(key: string, document: unknown): unknown {
  if (key !== "dpoa" || !document || typeof document !== "object") return document;
  const doc = document as { blocks?: { kind?: string; field?: { key?: string } }[] };
  if (!Array.isArray(doc.blocks)) return document;
  return {
    ...doc,
    // Also set aside: revision 8's "List date of JBA policy manual signed by employee" (HR via Pau, 19 Nov 2026), a box
    // the published version does not have. `required-history-boxes.test.ts` checks its place and its words.
    blocks: doc.blocks.filter(
      (block) => !(block.kind === "field" && (block.field?.key === "payroll_deduct_amount" || block.field?.key === "policy_manual_signed")),
    ),
  };
}

const RENAMED: Readonly<Record<string, string>> = { "stc-exit": "resignation-exit" };


/**
 * EXPLICITLY APPROVED CONTENT CHANGES (not branding, not Salon -> Store, not
 * client -> guest). Each entry is one exact sentence, from the Ask Sunny
 * published text to the Buff City Soap text, approved by the business on
 * 2026-10-19 (Phase 2A). The test accepts a difference ONLY if it is exactly one
 * of these pairs, so this list cannot widen into a general exemption: any other
 * wording change still fails the approved-list test.
 */
/** The Corrective Action Form's revision note as the reference platform published it. */
const DPOA_NOTE_REVISION_5 = String(TEMPLATES.find((template) => template.key === "dpoa")!.revisionNote);
/** The one sentence revision 6 adds to it. */
const DPOA_REVISION_6 =
  'Revision 6 (District Manager feedback, 21 Oct 2026) makes the Action Plan two sentences — "Management will review the <policy> policy with <employee>." and "Future policy violations may result in additional corrective action up to and including termination of employment." — with the payroll deduction between them when payroll deduct is Yes.';

/** The one sentence revision 7 adds (client request, template approved 4 Nov 2026). */
const DPOA_REVISION_7 =
  "Revision 7 (client request, 4 Nov 2026) makes Type of Offense four boxes — Attendance Policy, Standards of Conduct, Dress Code Violation, Other — removing Tardiness/Leaving Early and Absenteeism (now Attendance Policy), Under Performance and Violation of Company Policies (now Standards of Conduct), and the Other write-in line (Other is a box).";

/** The one sentence revision 8 adds (HR via Pau, 19 Nov 2026, from Ask Sunny's revision 9). */
const DPOA_REVISION_8 =
  'Revision 8 (HR via Pau, 19 Nov 2026) replaces the one history line with two required boxes, in HR\'s words: "List date of JBA policy manual signed by employee" (typed by the person creating the form) and "List previous coaching and corrective actions and include date signed by employee in past 90 days" (the same key as before). Neither can be left blank at Finalize.';

/*
 * BUFF CITY SOAP TITLES AND TERMS (Pau, 23 Nov: BCS terms in the forms; QA's final picks), for the six templates
 * unhidden that day only: the Team Member and General Manager Performance EPPs, the Assistant General Manager
 * Development EPP (KB performance framework, section 5), the Team Member Interview Form and the two management
 * interviews. Each change is accepted only as one of these exact pairs: the names and abbreviations from the Woven
 * career ladder, the General Manager plan's reference-platform metrics as Buff City Soap's Domo KPIs (KB "Domo
 * Reporting Overview"; their stored keys unchanged) and SVC as the store reports (Domo), and the interviews' approved
 * sentences (Buff Rewards from the KB "Buff Rewards – Talk Track and FAQ").
 */
const BCS_TERMS_TEMPLATES: ReadonlySet<string> = new Set(["tsd-epp", "asd-sdit-epp", "fttc-epp", "tanning-consultant-interview", "management-interview-round-1", "management-interview-round-2"]);
const APPROVED_BCS_TERMS: readonly { from: string; to: string }[] = [
  { from: "TSD EPP", to: "General Manager Performance EPP" },
  { from: "TSD EPP", to: "GM EPP" },
  { from: "Employee Performance Plan for a Training Salon Director.", to: "Employee Performance Plan for a General Manager, reviewed with the District Manager." },
  { from: "The Management Performance Plan the business issues: the nine management expectations marked twice, five metrics for the manager and five for the salon, the manager's own self-assessment, the eight Plan of Action objectives and their re-evaluation, with the company-policy expectation stated against the JB & Associates Employment Policy Manual.", to: "Buff City Soap's General Manager Performance EPP: the nine management expectations marked twice, six KPIs (Net Sales, Comp Sales %, IPT, AOV, Discount Rate %, Product Mix %, Goal / Result each) for the manager and for the store, the manager's own self-assessment, the eight Plan of Action objectives and their re-evaluation." },
  { from: "Management EPP (TSD).pdf", to: "General Manager Performance EPP.pdf" },
  { from: "PPTA", to: "Net Sales (Goal / Result)" },
  { from: "LPSVA", to: "Comp Sales % (Goal / Result)" },
  { from: "UPTA", to: "IPT (Goal / Result)" },
  { from: "Club Close", to: "AOV (Goal / Result)" },
  { from: "Average Club Dollar", to: "Discount Rate % (Goal / Result)" },
  { from: "Aware of all items on the SVC and able to describe to DM", to: "Aware of all items on the store reports (Domo) and able to describe to DM" },
  { from: "Salon Standards of Cleanliness and Safety \u2014 Aware of all items on the SVC and able to describe to DM", to: "Store Standards of Cleanliness and Safety \u2014 Aware of all items on the store reports (Domo) and able to describe to DM" },
  { from: "What do you feel is the most important skill for a Salon Director to possess?", to: "What do you feel is the most important skill for a General Manager to possess?" },
  { from: "TSD review", to: "GM review" },
  { from: "TSD", to: "GM" },
  { from: "ASD-SDIT Performance EPP", to: "Assistant General Manager Development EPP" },
  { from: "ASD-SDIT", to: "AGM EPP" },
  { from: "Performance plan covering the ASD to SDIT development track.", to: "Development plan for an Assistant General Manager, reviewed with the General Manager." },
  { from: "Seeded from the approved reference forms.", to: "Buff City Soap's Assistant General Manager Development EPP (Pau, 23 Nov 2026)." },
  { from: "ASD-SDIT Performance EPP.pdf", to: "Assistant General Manager Development EPP.pdf" },
  { from: "Performance EPP - ASD/SDIT", to: "Development EPP - Assistant General Manager" },
  { from: "ASD/SDIT review", to: "AGM review" },
  { from: "Training Salon Director", to: "General Manager" },
  { from: "ASD", to: "AGM" },
  { from: "FTTC Performance EPP", to: "Team Member Performance EPP" },
  { from: "FTTC", to: "TM EPP" },
  { from: "Performance plan for a full-time Tanning Consultant.", to: "Employee Performance Plan for a Team Member (full time, part time or seasonal), reviewed with the General Manager." },
  { from: "Seeded from the approved reference forms.", to: "Buff City Soap's Team Member Performance EPP (Pau, 23 Nov 2026)." },
  { from: "FTTC Performance EPP.pdf", to: "Team Member Performance EPP.pdf" },
  { from: "Performance EPP - FTTC", to: "Performance EPP - Team Member" },
  { from: "FTTC review", to: "Team Member review" },
  { from: "Salon Director", to: "General Manager" },
  { from: "TC", to: "TM" },
  { from: "Tanning Consultant Interview Form", to: "Team Member Interview Form" },
  { from: "TC Interview", to: "TM Interview" },
  { from: "The in-salon interview for a Tanning Consultant. Twelve questions through service, sales, accountability, the core values and the essential job functions.", to: "The in-store interview for a Team Member. Twelve questions through service, sales, accountability, the core values and the essential job functions." },
  { from: "Published from the 03. Tanning Consultant Interview Form source document.", to: "Buff City Soap's Team Member Interview Form, restored from the last published version (v4) with its new title." },
  { from: "Tanning Consultant Interview Form.pdf", to: "Team Member Interview Form.pdf" },
  { from: "A client approaches the counter upset because the tanning bed they reserved is unavailable due to a mechanical issue. They are raising their voice and demanding a refund, while other clients are in the salon. Show how you would handle the client in the moment and explain the steps you would take afterward to address the root cause.", to: "A guest approaches the counter upset because the product they came in for is out of stock. They are raising their voice and demanding a refund, while other guests are in the store. Show how you would handle the guest in the moment and explain the steps you would take afterward to address the root cause." },
  { from: "If you were given direction as a Salon Director to reduce expenses, what would be the first three areas you would focus on, and why?", to: "If you were given direction as a General Manager to reduce expenses, what would be the first three areas you would focus on, and why?" },
  { from: "Scenario 2: Customer visits have dropped 20% over the past month and lotions and memberships sales are at their lowest in six months. One long-time team member is resistant to promoting add-ons, saying, “Customers don’t want to be pushed.” What are your next steps?", to: "Scenario 2: Guest visits have dropped 20% over the past month and add-on product sales and Buff Rewards sign-ups are at their lowest in six months. One long-time team member is resistant to recommending related products, saying, “Guests don’t want to be pushed.” What are your next steps?" },
  { from: "How would you create a 30–60–90 day training plan for a new Assistant Salon Director or Tanning Consultant?", to: "How would you create a 30–60–90 day training plan for a new Assistant General Manager or Team Member?" },
  // QA's printed-form review (23 Nov 2026): no count that disagrees with the five values listed; the Q8 apostrophes.
  { from: "8. Our company has five core values. Id like to hear about a time in your past experiences--work, school, or personal where youve shown one of these in action.", to: "8. Our company has five core values. I’d like to hear about a time in your past experiences--work, school, or personal where you’ve shown one of these in action." },
  { from: "4. Core Values Speech: While reviewing the Core Values Speech with the candidate, ask for examples (personally or professionally) that they have demonstrated each of the 4 Core Values.", to: "4. Core Values Speech: While reviewing the Core Values Speech with the candidate, ask for examples (personally or professionally) that they have demonstrated each of our Core Values." },
];

const APPROVED_CONTENT_CHANGES: { decision: string; from: string; to: string }[] = [
  { decision: "D3 — 7G Service", from: "Follow through with Client Engagement Strategies with every client.", to: "Follow through with 7G Service with every guest." },
  { decision: "D4 — Employee Performance Plan acknowledgement", from: "I confirm that my supervisor and I have discussed this training document and I will participate in the plan for improvement.", to: "I confirm that my supervisor and I have discussed this Employee Performance Plan and I will participate in the plan for improvement." },
  { decision: "D12 — demotion example destination role", from: "(Employee) is moving from a FT (Job Title) at $x.xx /hr at (location, State abbr.) to a PT Tanning Consultant at $x.xx /hr at (location,State abbr.) effective dd/mm/yyyy. (**Effective date must be the start of a pay period).", to: "(Employee) is moving from a FT (Job Title) at $x.xx /hr at (location, State abbr.) to a PT (New Job Title) at $x.xx /hr at (location,State abbr.) effective dd/mm/yyyy. (**Effective date must be the start of a pay period)." },
  { decision: "D18 — Makery cleaning scenario", from: "This role involves hands-on work like cleaning beds and doing laundry. How do you lead by example in these tasks?", to: "This role involves hands-on work like cleaning the Makery and equipment and keeping the workspace organized. How do you lead by example in these tasks?" },
  /*
   * District Manager feedback, 21 Oct 2026, approved for Ask Bubbles: the
   * Corrective Action Form's Action Plan is two sentences and its closing says
   * "may result in" (revision 6). The plan is built in `ca-action-plan.ts`.
   */
  { decision: "DM-1 — Corrective Action Action Plan help", from: "One paragraph: what is being done, what the employee does going forward, and that the manual's own wording is reviewed with them. No dates and no follow-up meeting. It always ends with the form's closing sentence, which is added automatically.", to: "Two sentences: management will review the policy cited under Direct policy with the employee, and the form's closing sentence — with the payroll deduction between them when payroll deduct is Yes. Written by Ask Bubbles from the form; the closing is added automatically." },
  { decision: "DM-2 — Corrective Action closing, \"may result in\"", from: CA_ACTION_PLAN_CLOSING_REVISION_5, to: CA_ACTION_PLAN_CLOSING },
  // Revision 7 (client request, template approved 4 Nov 2026) added its own sentence after revision 6's; revision 8 (HR via Pau, 19 Nov 2026) adds one after that, so the note below carries all three (DM-3 and HR-1).
  // Revision 8 (HR via Pau, 19 Nov 2026) adds its sentence after revision 7's; its label, help and required mark are below.
  { decision: "DM-3 + HR-1 — Corrective Action revision 6, 7 and 8 note", from: DPOA_NOTE_REVISION_5, to: DPOA_NOTE_REVISION_5.replace(" Forms filed against earlier versions", ` ${DPOA_REVISION_6} ${DPOA_REVISION_7} ${DPOA_REVISION_8} Forms filed against earlier versions`) },
  { decision: "HR-1 — history box help", from: "One per line: each coaching or corrective action previously received, with the date it was signed. Write \"None — first occurrence\" when there has been none.", to: "One per line: each coaching or corrective action received in the past 90 days, with the date the employee signed it. Write \"None — first occurrence\" when there has been none. Required." },
  { decision: "HR-1 — history box label", from: "List previously received coaching and/or corrective action with date signed", to: "List previous coaching and corrective actions and include date signed by employee in past 90 days" },
  /*
   * QA, 25 Oct 2026 (Pau's answers): Buff City Soap uses MyGlow and Sunlync,
   * so both exit steps keep the source wording and only the tanning clause
   * goes (exit form revision 4; there is no QA-1 any more — Pau confirmed
   * MyGlow, 25 Oct 2026). The FTTC EPP's
   * description — printed on the chooser's cards — repeats the plan's own
   * name instead of the tanning role. See `exit-sibling-wording.test.ts`.
   */
  { decision: "QA-2 — exit step, tanning clause removed (Sunlync kept)", from: "Place comment on employee’s Sunlync account stating they are no longer employed, verify tanning has been removed.", to: "Place comment on employee’s Sunlync account stating they are no longer employed." },
  // QA-3 (the FTTC description) is superseded by Pau's 23 Nov 2026 description, an APPROVED_BCS_TERMS pair.
  // QA-4 is back with the Team Member Interview Form (restored, Pau, 23 Nov 2026).
  { decision: "QA-4 — Team Member Interview core-values heading", from: "Sun Tan City Core Values", to: "Core Values" },
  /*
   * QA-4 ("Sun Tan City Core Values" -> "Core Values") was the Tanning Consultant Interview's. That form was removed
   * from the library (Pau, 21 Nov 2026), so the approved pair has nothing left to apply to and is no longer listed.
   */
  /*
   * QA, 29 Oct 2026: the drafting prompt has written this field as Observed /
   * Expectation / Going Forward since the Corrective Action change; the help
   * still said two sections. Wording only (no revision: the published version
   * keeps its help until a revision is approved).
   */
  { decision: "QA-5 — Coaching details help, three sections", from: "Written as \"Observed:\" — what happened — then \"Expectation:\" — what the manager told the employee to do differently. One field, two labelled sections.", to: "Written as \"Observed:\" — what happened — then \"Expectation:\" — what the manager told the employee to do differently — then \"Going Forward:\" — what the employee will do from now on. One field, three labelled sections." },
];

function comparable(seed: Record<string, unknown>) {
  return {
    key: seed.key,
    name: seed.name,
    shortName: seed.shortName,
    description: seed.description,
    category: seed.category,
    layoutFamily: seed.layoutFamily,
    requiredPermission: seed.requiredPermission,
    displayOrder: seed.displayOrder,
    revisionNote: seed.revisionNote,
    provenance: seed.provenance ?? null,
    bundledPdfName: seed.bundledPdfName,
    document: seed.document,
    variants: seed.variants,
  };
}

function differences(a: unknown, b: unknown, path: string, out: { path: string; from: unknown; to: unknown }[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      differences(left[key], right[key], `${path}${Array.isArray(a) ? `[${key}]` : `.${key}`}`, out);
    }
    return;
  }
  out.push({ path, from: a ?? null, to: b ?? null });
}

describe("the migrated templates are the reference platform's published templates", () => {
  it("snapshot: every template's content matches the published version's database fingerprint", () => {
    // The whole reference snapshot, including the template this library no longer ships.
    expect(SNAPSHOT_TEMPLATES).toHaveLength(17);
    for (const template of SNAPSHOT_TEMPLATES) {
      expect(md5(template.document), template.key).toBe(template.documentMd5);
      expect(md5(template.variants), template.key).toBe(template.variantsMd5);
    }
  });

  // All 17 again (Pau, 23 Nov: BCS terms in the forms): the consultant interview is back as the Team Member Interview Form. CHANGED ON PURPOSE.
  it("the library ships the snapshot's 17 templates, once each, and nothing else", () => {
    const keys = MIGRATED_TEMPLATE_SEEDS.map((seed) => seed.key).sort();
    expect(keys).toEqual(TEMPLATES.map((template) => RENAMED[template.key] ?? template.key).sort());
    expect(new Set(keys).size).toBe(17);
    expect(TEMPLATE_SEEDS.map((seed) => seed.key).sort()).toEqual(keys);
  });

  it("the snapshot's consultant interview is the library's Team Member Interview Form, and its key is not retired (Pau, 23 Nov 2026)", () => {
    expect(REMOVED_FROM_LIBRARY).toEqual([]);
    expect(TEMPLATE_SEEDS.find((seed) => seed.key === "tanning-consultant-interview")?.name).toBe("Team Member Interview Form");
    expect(RETIRED_TEMPLATE_KEYS).not.toContain("tanning-consultant-interview");
  });

  it("every difference from the published version is on the approved list, and every approved change is present", () => {
    const actual: ApprovedChange[] = [];
    for (const template of TEMPLATES) {
      const seed = MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === (RENAMED[template.key] ?? template.key));
      expect(seed, template.key).toBeDefined();
      const found: { path: string; from: unknown; to: unknown }[] = [];
      differences(
        comparable({ ...template, document: withApprovedRemovals(RENAMED[template.key] ?? template.key, template.document) }),
        comparable({
          ...(seed as unknown as Record<string, unknown>),
          document: withoutUnpublishedPayrollAmount(seed!.key, seed!.document),
        }),
        "",
        found,
      );
      for (const entry of found) actual.push({ sourceKey: template.key, ...entry });
    }
    expect(actual).toEqual(CHANGES);
  });

  it("approved removals are narrow: each block exists in the snapshot, is gone from the seed, and nothing else was dropped", () => {
    // 2: Corrective Action revision 7 (4 Nov 2026) removes the Other write-in line.
    expect(APPROVED_REMOVALS).toHaveLength(2);
    for (const removal of APPROVED_REMOVALS) {
      const template = TEMPLATES.find((entry) => entry.key === removal.templateKey)!;
      const seed = MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === removal.templateKey)!;
      type Block = { kind?: string; field?: { key?: string; label?: string } };
      const before = (template.document as { blocks: Block[] }).blocks;
      // The unpublished payroll amount line is not on the snapshot (see `withoutUnpublishedPayrollAmount`).
      const after = (withoutUnpublishedPayrollAmount(seed.key, seed.document) as { blocks: Block[] }).blocks;
      const removed = before.find((block) => block.kind === "field" && block.field?.key === removal.fieldKey);
      expect(removed?.field?.label, removal.decision).toBe(removal.snapshotLabel);
      expect(after.some((block) => block.field?.key === removal.fieldKey), removal.decision).toBe(false);
      // Exactly one block fewer, and every other field key is still there, in the same order.
      expect(after.length).toBe(before.length - 1);
      const keys = (blocks: Block[]) => blocks.filter((block) => block.kind === "field").map((block) => block.field?.key);
      expect(keys(after)).toEqual(keys(before).filter((key) => key !== removal.fieldKey));
    }
  });

  it("the explicitly approved content changes are exactly the Phase 2A sentences, each present and nothing wider", () => {
    const matching = CHANGES.filter((change) =>
      APPROVED_CONTENT_CHANGES.some((entry) => entry.from === change.from && entry.to === change.to),
    );
    // D3 x2 (SDIT, both lists), D4 x10 (six EPPs; SDIT, TSD and both DMIT print it twice), D12 x1, D18 x1, DM-1..3 x1 each,
    // QA-2 x1 (QA, 25 Oct 2026: no sibling-company wording; QA-1 dropped, MyGlow confirmed by Pau). QA-3 is superseded by
    // Pau's 23 Nov 2026 FTTC description (an APPROVED_BCS_TERMS pair); QA-4 is back with the Team Member Interview Form.
    // QA-5 x1 (QA, 29 Oct 2026: the Coaching details help names the three sections the prompt asks for).
    // + HR-1 x2 (Ask Sunny's revision 9, 19 Nov 2026: the history box's label and help; the revision note replaces DM-3's pair).
    expect(matching).toHaveLength(22);
    for (const entry of APPROVED_CONTENT_CHANGES) {
      expect(matching.some((change) => change.from === entry.from), entry.decision).toBe(true);
    }
    expect(new Set(matching.map((change) => change.sourceKey))).toEqual(
      new Set(["coaching", "sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit", "demotion", "management-interview-round-1", "dpoa", "stc-exit", "tanning-consultant-interview"]),
    );
  });

  it("each approved change is a branding change of an authorized kind", () => {
    const SOURCE_COMPANY = /Sun Tan City|SUN TAN CITY|\bSTC\b/;
    const SOURCE_APP = /ASK[ _]SUNNY|Ask Sunny/;
    for (const change of CHANGES) {
      const where = `${change.sourceKey} ${change.path}`;
      if (change.path === ".document.style.logo") {
        // The source company's logo, removed; nothing replaces it.
        expect(change.to, where).toBeNull();
        continue;
      }
      // Product Mix %, the sixth Domo KPI (Pau, 23 Nov: BCS terms in the forms): one new line at the end of each KPI row of
      // the General Manager plan, on a new key, drafted from the manager's figures like the five beside it.
      if (change.sourceKey === "tsd-epp" && change.from === null && /^\.document\.blocks\[\d+\]\.fields\[5\]$/.test(change.path)) {
        const prefix = (change.to as { key?: string }).key?.split("_")[0];
        expect(["manager", "salon"], where).toContain(prefix);
        expect(change.to, where).toEqual({ key: `${prefix}_product_mix`, label: "Product Mix % (Goal / Result)", input: "text", responsibility: "ai" });
        continue;
      }
      if (change.sourceKey === "stc-exit" && change.path === ".key") {
        expect(change.to, where).toBe("resignation-exit");
        continue;
      }
      // HR-1 (19 Nov 2026): the history box is required. A mark the published version does not have.
      if (change.sourceKey === "dpoa" && change.path.endsWith(".field.required")) {
        expect(change.from, where).toBeNull();
        expect(change.to, where).toBe(true);
        continue;
      }
      expect(typeof change.from, where).toBe("string");
      expect(typeof change.to, where).toBe("string");
      const from = change.from as string;
      const to = change.to as string;
      // The description change that accompanies an approved removal: the exact pair only.
      if (APPROVED_REMOVAL_DESCRIPTION_CHANGES.some((entry) => entry.templateKey === change.sourceKey && entry.from === from && entry.to === to)) continue;
      // A Phase 2A change is accepted only as the exact approved pair.
      if (APPROVED_CONTENT_CHANGES.some((entry) => entry.from === from && entry.to === to)) continue;
      // Pau's Buff City Soap terms (23 Nov 2026): the exact pair, on one of the six templates unhidden that day.
      if (BCS_TERMS_TEMPLATES.has(change.sourceKey) && APPROVED_BCS_TERMS.some((entry) => entry.from === from && entry.to === to)) continue;
      // Salon -> Store is the other authorized substitution: Buff City Soap's locations are stores.
      const SOURCE_TERM = /\b[Ss]alons?\b|\bSALONS?\b|\b[Cc]lients?\b|\b[Cc]ustomers?\b/;
      // The authorized terminology substitutions: Salon -> Store, and client/customer -> guest.
      const unsalon = (text: string) =>
        text
          .replace(/\bSalons\b/g, "Stores").replace(/\bsalons\b/g, "stores").replace(/\bSalon\b/g, "Store").replace(/\bsalon\b/g, "store")
          .replace(/\b[Cc]lients\b|\b[Cc]ustomers\b/g, (word) => (word[0] === word[0]!.toUpperCase() ? "Guests" : "guests"))
          .replace(/\b[Cc]lient\b|\b[Cc]ustomer\b/g, (word) => (word[0] === word[0]!.toUpperCase() ? "Guest" : "guest"));
      expect(SOURCE_COMPANY.test(from) || SOURCE_APP.test(from) || SOURCE_TERM.test(from), where).toBe(true);
      expect(SOURCE_COMPANY.test(to) || SOURCE_APP.test(to), where).toBe(false);
      // Only the names change: undo the substitutions and the source text comes back.
      const restored = to
        .replace(/BUFF CITY SOAP/g, "SUN TAN CITY")
        .replace(/Buff City Soap/g, "Sun Tan City")
        .replace(/Ask Bubbles/g, "Ask Sunny")
        .replace(/^Published from the PERFORMANCE MANAGEMENT FRAMEWORK/, "Published from ASK SUNNY PERFORMANCE MANAGEMENT FRAMEWORK")
        .replace(/^PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT$/, "ASK_SUNNY_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT")
        .replace(/^The exit paperwork/, "The STC exit paperwork")
        .replace(/The source company's Demotion Example/, "The STC Demotion Example");
      // Both sides are read through the authorized substitutions, so only those substitutions can differ.
      expect(unsalon(restored), where).toBe(unsalon(from));
    }
  });

  it("puts Payroll deduction amount on the Corrective Action seed, after Yes/No, and not on the published snapshot", () => {
    type Block = { kind?: string; key?: string; field?: { key?: string; label?: string; responsibility?: string } };
    const seed = (MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === "dpoa")!.document as { blocks: Block[] }).blocks;
    const published = (TEMPLATES.find((entry) => entry.key === "dpoa")!.document as { blocks: Block[] }).blocks;
    const at = seed.findIndex((block) => block.kind === "field" && block.field?.key === "payroll_deduct_amount");
    expect(seed[at - 1]).toMatchObject({ kind: "checkbox_group", key: "payroll_deduct" });
    expect(seed[at]?.field).toMatchObject({
      label: "Payroll deduction amount",
      responsibility: "manager",
    });
    expect(published.some((block) => block.field?.key === "payroll_deduct_amount")).toBe(false);
  });
});
