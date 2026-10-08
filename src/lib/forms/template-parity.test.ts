import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import approved from "@/test/fixtures/approved-template-changes.json";
import snapshot from "@/test/fixtures/ask-sunny-published-templates.json";

import { MIGRATED_TEMPLATE_SEEDS, TEMPLATE_SEEDS } from "./library";

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

const RENAMED: Readonly<Record<string, string>> = { "stc-exit": "resignation-exit" };

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
        comparable(template),
        comparable(seed as unknown as Record<string, unknown>),
        "",
        found,
      );
      for (const entry of found) actual.push({ sourceKey: template.key, ...entry });
    }
    expect(actual).toEqual(CHANGES);
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
      expect(SOURCE_COMPANY.test(from) || SOURCE_APP.test(from), where).toBe(true);
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
      expect(restored, where).toBe(from);
    }
  });
});
