import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import approved from "@/test/fixtures/approved-template-changes.json";
import snapshot from "@/test/fixtures/ask-sunny-published-templates.json";

import { APPROVED_REMOVAL_DESCRIPTION_CHANGES, APPROVED_REMOVALS, withApprovedRemovals } from "@/test/approved-removals";

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

const TEMPLATES = snapshot.templates as unknown as SnapshotTemplate[];
const CHANGES = approved.changes as ApprovedChange[];

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
    blocks: doc.blocks.filter((block) => !(block.kind === "field" && block.field?.key === "payroll_deduct_amount")),
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
  { decision: "DM-3 — Corrective Action revision 6 note", from: DPOA_NOTE_REVISION_5, to: DPOA_NOTE_REVISION_5.replace(" Forms filed against earlier versions", ` ${DPOA_REVISION_6} Forms filed against earlier versions`) },
  /*
   * QA, 25 Oct 2026 (Pau's answers): MyGlow is not confirmed for Buff City
   * Soap, so the exit step names "the scheduling/HR system"
   * (`config/company/forms/exit-systems.ts`); Sunlync is confirmed and stays,
   * without the tanning clause (exit form revision 4). The FTTC EPP's
   * description — printed on the chooser's cards — repeats the plan's own
   * name instead of the tanning role. See `exit-sibling-wording.test.ts`.
   */
  { decision: "QA-1 — exit step, MyGlow not confirmed", from: "Upload Exit Form to employee’s personal file and remove employee from MyGlow.", to: "Upload Exit Form to employee’s personal file and remove employee from the scheduling/HR system." },
  { decision: "QA-2 — exit step, tanning clause removed (Sunlync kept)", from: "Place comment on employee’s Sunlync account stating they are no longer employed, verify tanning has been removed.", to: "Place comment on employee’s Sunlync account stating they are no longer employed." },
  { decision: "QA-3 — FTTC EPP description", from: "Performance plan for a full-time Tanning Consultant.", to: "The FTTC Employee Performance Plan." },
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
    expect(TEMPLATES).toHaveLength(17);
    for (const template of TEMPLATES) {
      expect(md5(template.document), template.key).toBe(template.documentMd5);
      expect(md5(template.variants), template.key).toBe(template.variantsMd5);
    }
  });

  it("the library ships all 17, once each, and nothing else", () => {
    const keys = MIGRATED_TEMPLATE_SEEDS.map((seed) => seed.key).sort();
    expect(keys).toEqual(TEMPLATES.map((template) => RENAMED[template.key] ?? template.key).sort());
    expect(new Set(keys).size).toBe(17);
    expect(TEMPLATE_SEEDS.map((seed) => seed.key).sort()).toEqual(keys);
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
    expect(APPROVED_REMOVALS).toHaveLength(1);
    for (const removal of APPROVED_REMOVALS) {
      const template = TEMPLATES.find((entry) => entry.key === removal.templateKey)!;
      const seed = MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === removal.templateKey)!;
      type Block = { kind?: string; field?: { key?: string; label?: string } };
      const before = (template.document as { blocks: Block[] }).blocks;
      const after = (seed.document as { blocks: Block[] }).blocks;
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
    // QA-1..3 x1 each (QA, 25 Oct 2026: no sibling-company system names).
    expect(matching).toHaveLength(20);
    for (const entry of APPROVED_CONTENT_CHANGES) {
      expect(matching.some((change) => change.from === entry.from), entry.decision).toBe(true);
    }
    expect(new Set(matching.map((change) => change.sourceKey))).toEqual(
      new Set(["sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit", "demotion", "management-interview-round-1", "dpoa", "stc-exit"]),
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
      if (change.sourceKey === "stc-exit" && change.path === ".key") {
        expect(change.to, where).toBe("resignation-exit");
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
