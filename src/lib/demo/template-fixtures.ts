import { isHiddenTemplate } from "@/config/company/forms/hidden";
import { RETIRED_TEMPLATE_KEYS } from "@/config/company/forms/retired";
import { shiftDays } from "@/lib/business-date";
import type { TemplateSeed } from "@/lib/forms/catalog";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";
import type {
  LibrarySeedResult,
  TemplateAssetRow,
  TemplateRow,
  TemplateSummary,
  TemplateVersionRow,
} from "@/lib/forms/repository";

/**
 * ============================================================================
 * FORM TEMPLATES — A HEALTHY SYNCED LIBRARY, FOR DEMO BUILDS ONLY
 * ============================================================================
 *
 * Built from the real template seeds (`TEMPLATE_SEEDS`): the documents, names
 * and revisions are the ones a live deployment installs. What is invented is
 * the history around them — publish dates, who published, the official copy's
 * file size — so the screen reads as a deployment that has been synced for a
 * while. Nothing is read from or written to a database.
 */

/** The demo's fixed "installed" day; versions are spaced back from it. */
const INSTALLED = "2026-09-01";
const PUBLISHER = "Demo Owner";

function seedsShown(): TemplateSeed[] {
  return TEMPLATE_SEEDS.filter(
    (seed) => !isHiddenTemplate(seed.key) && !RETIRED_TEMPLATE_KEYS.includes(seed.key),
  );
}

function templateRow(seed: TemplateSeed): TemplateRow {
  return {
    id: `demo-template-${seed.key}`,
    key: seed.key,
    name: seed.name,
    shortName: seed.shortName,
    description: seed.description,
    category: seed.category,
    layoutFamily: seed.layoutFamily,
    requiredPermission: seed.requiredPermission,
    active: true,
    displayOrder: seed.displayOrder,
  };
}

/** Every version of a template, newest first: the seed's revision is current. */
function versionsOf(seed: TemplateSeed): TemplateVersionRow[] {
  const versions: TemplateVersionRow[] = [];
  for (let version = seed.revision; version >= 1; version -= 1) {
    const current = version === seed.revision;
    // Version 1 on the install day; each later one about a week after the last.
    const day = shiftDays(INSTALLED, (version - 1) * 7 + (seed.displayOrder % 3));
    versions.push({
      id: `demo-version-${seed.key}-${version}`,
      templateId: `demo-template-${seed.key}`,
      version,
      status: current ? "published" : "archived",
      document: seed.document,
      variants: seed.variants,
      seedRevision: version,
      proposal: null,
      notes: current
        ? seed.revisionNote
        : `Revision ${version} of the source document. Superseded by version ${version + 1}.`,
      createdBy: "system",
      createdAt: `${day}T14:00:00.000Z`,
      publishedAt: `${day}T14:05:00.000Z`,
      publishedBy: version === 1 ? "system" : PUBLISHER,
    });
  }
  return versions;
}

function pageCount(seed: TemplateSeed): number {
  return Math.max(2, seed.document.blocks.filter((block) => block.kind === "page_break").length + 1);
}

/** The official copy: the bundled original, then the business's uploaded file, which is active. */
function assetsOf(seed: TemplateSeed): TemplateAssetRow[] {
  const pages = pageCount(seed);
  const word = seed.displayOrder % 4 === 1;
  const uploaded = shiftDays(INSTALLED, 3 + (seed.displayOrder % 5));
  const base = {
    templateId: `demo-template-${seed.key}`,
    storagePath: null,
    contentSha256: null,
    pageCount: pages,
    acroform: { hasFields: false, fieldCount: 0 },
  };
  return [
    {
      ...base,
      id: `demo-asset-${seed.key}-2`,
      version: 2,
      kind: "upload",
      status: "active",
      fileName: word ? seed.bundledPdfName.replace(/\.pdf$/i, ".docx") : seed.bundledPdfName,
      sizeBytes: 41_000 + pages * 23_400 + seed.displayOrder * 977,
      mimeType: word
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
      validation: { format: word ? "docx" : "pdf" },
      uploadedBy: PUBLISHER,
      createdAt: `${uploaded}T15:20:00.000Z`,
    },
    {
      ...base,
      id: `demo-asset-${seed.key}-1`,
      version: 1,
      kind: "bundled_default",
      status: "superseded",
      fileName: seed.bundledPdfName,
      sizeBytes: 38_000 + pages * 21_500 + seed.displayOrder * 731,
      mimeType: "application/pdf",
      validation: { format: "pdf" },
      uploadedBy: "system",
      createdAt: `${INSTALLED}T14:00:00.000Z`,
    },
  ];
}

/** The current version of a re-issued form was read out of its uploaded official copy. */
function withProvenance(seed: TemplateSeed, version: TemplateVersionRow, asset: TemplateAssetRow): TemplateVersionRow {
  if (seed.revision < 2) return version;
  const blocks = seed.document.blocks;
  return {
    ...version,
    proposal: {
      assetId: asset.id,
      fileName: asset.fileName,
      format: asset.mimeType === "application/pdf" ? "pdf" : "docx",
      extractedAt: version.createdAt,
      extractedBy: PUBLISHER,
      warnings: [],
      unresolved: [],
      alignment: { matched: [], added: [], removed: [] },
      stats: {
        blocks: blocks.length,
        fields: blocks.filter((block) => block.kind === "field" || block.kind === "field_row").length,
        groups: blocks.filter((block) => block.kind === "section").length,
        signatures: blocks.filter((block) => block.kind === "signature_row").length,
      },
    },
  };
}

export function demoTemplateSummaries(): TemplateSummary[] {
  return seedsShown().map((seed) => {
    const versions = versionsOf(seed);
    const assets = assetsOf(seed);
    return {
      ...templateRow(seed),
      currentVersion: versions[0] ? withProvenance(seed, versions[0], assets[0]!) : null,
      draftVersion: null,
      versionCount: versions.length,
      activeAsset: assets[0] ?? null,
      assetCount: assets.length,
    };
  });
}

export interface DemoTemplate {
  template: TemplateRow;
  versions: TemplateVersionRow[];
  current: TemplateVersionRow | null;
  assets: TemplateAssetRow[];
}

export function demoTemplate(key: string): DemoTemplate | null {
  const seed = seedsShown().find((entry) => entry.key === key);
  if (!seed) return null;
  const assets = assetsOf(seed);
  const versions = versionsOf(seed).map((version, index) =>
    index === 0 ? withProvenance(seed, version, assets[0]!) : version,
  );
  return { template: templateRow(seed), versions, current: versions[0] ?? null, assets };
}

/** What the sync reports on a demo visit: every template already up to date. */
export function demoSyncResult(): LibrarySeedResult {
  return {
    created: [],
    existing: seedsShown().map((seed) => seed.key),
    revised: [],
    renamed: [],
    heldBack: [],
    failed: [],
  };
}

/** Said by every template write in a demo build. */
export const DEMO_TEMPLATE_WRITE_REFUSAL =
  "This is a demo deployment, so template changes are not saved. In a live deployment this publishes to the forms database.";
