import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPANY_FORM_CATEGORY,
  FORM_LAYOUT_FAMILIES,
} from "@/config/company/forms/categories";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * INSTALLING THE LIBRARY, AND RE-ISSUING A FORM.
 *
 * The rule these tests exist for: WHEN THE BUSINESS HANDS OVER A NEW COPY OF A
 * FORM THAT ALREADY EXISTS, the new copy has to become the one people fill,
 * without the old one becoming unreadable and without overwriting an
 * administrator who has taken the form over.
 *
 * That is three separate promises, and each is easy to break in a way nothing
 * else would notice:
 *
 *   the new document is published and becomes current;
 *   the OLD version still exists, archived, so every form already signed
 *   against it still renders;
 *   a template a person has authored a version of is LEFT ALONE.
 *
 * The fake client is described in `src/test/fake-supabase.ts`; the library is
 * the fixture registry in `src/test/forms/fixture-forms.ts`.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => fakeSupabase(store),
}));

/* The fixture library: several forms, at several seed revisions. */
vi.mock("@/config/company/forms", async () =>
  (await import("@/test/forms/fixture-forms")).fixtureFormsModule(),
);

const { ensureTemplateLibrary } = await import("./repository");
const { TEMPLATE_SEEDS } = await import("./library");

function reset() {
  store.form_templates = [];
  store.form_template_versions = [];
  store.form_template_current = [];
  store.form_template_assets = [];
}

const COACHING = "fixture-coaching";
const CORRECTIVE = "fixture-corrective";
const REVIEW = "fixture-role-review";

const coachingSeed = TEMPLATE_SEEDS.find((seed) => seed.key === COACHING)!;

/** The fixture coaching note as revision 1 had it — topics since replaced. */
const SUPERSEDED_COACHING = {
  paper: "letter",
  blocks: [
    { kind: "letterhead", brand: "BUFF CITY SOAP", title: "Fixture Coaching Note" },
    { kind: "section", label: "Topic Of Coaching" },
    {
      kind: "checkbox_group",
      key: "coaching_topics",
      options: [
        { key: "old_topic_one", label: "Old Topic One" },
        { key: "old_topic_two", label: "Old Topic Two" },
      ],
      responsibility: "ai",
      columns: 2,
    },
    { kind: "section", label: "Acknowledgement of Training" },
  ],
};

function templateRow(key: string) {
  return store.form_templates!.find((row) => row.key === key)!;
}

function versionsOf(key: string) {
  const id = templateRow(key).id;
  return store.form_template_versions.filter((row) => row.template_id === id);
}

function currentVersionOf(key: string) {
  const id = templateRow(key).id;
  const pointer = store.form_template_current!.find((row) => row.template_id === id);
  return store.form_template_versions.find((row) => row.id === pointer?.version_id);
}

beforeEach(reset);

describe("installing an empty library", () => {
  it("creates every template once, at its seed revision", async () => {
    const result = await ensureTemplateLibrary("system");

    expect(result.created).toHaveLength(TEMPLATE_SEEDS.length);
    expect(result.existing).toEqual([]);
    expect(result.revised).toEqual([]);
    expect(store.form_templates).toHaveLength(TEMPLATE_SEEDS.length);

    // Exactly one coaching note, at its seed revision — the current source document.
    expect(store.form_templates!.filter((row) => row.key === COACHING)).toHaveLength(1);
    expect(currentVersionOf(COACHING)).toMatchObject({
      version: 1,
      seed_revision: coachingSeed.revision,
    });
  });

  it("records each template's category, family, permission and order from its seed", async () => {
    await ensureTemplateLibrary("system");
    for (const seed of TEMPLATE_SEEDS) {
      expect(templateRow(seed.key), seed.key).toMatchObject({
        name: seed.name,
        category: seed.category,
        layout_family: seed.layoutFamily,
        required_permission: seed.requiredPermission,
        active: true,
        display_order: seed.displayOrder,
      });
      expect(currentVersionOf(seed.key), seed.key).toMatchObject({
        version: 1,
        status: "published",
        seed_revision: seed.revision,
      });
      expect(versionsOf(seed.key), seed.key).toHaveLength(1);
    }
  });

  it("installs a form behind its own permission exactly as the seed declares it", async () => {
    await ensureTemplateLibrary("system");
    expect(templateRow("fixture-separation").required_permission).toBe("manage_form_records");
  });

  it("does nothing at all the second time", async () => {
    await ensureTemplateLibrary("system");
    const before = JSON.stringify(store);

    const again = await ensureTemplateLibrary("system");

    expect(again.created).toEqual([]);
    expect(again.revised).toEqual([]);
    expect(again.existing).toHaveLength(TEMPLATE_SEEDS.length);
    expect(JSON.stringify(store)).toBe(before);
  });
});

/* ==================================================================== */
/*  THE RENAME REACHES A DATABASE THAT WAS SEEDED BEFORE IT              */
/* ==================================================================== */

/**
 * ============================================================================
 * A DISPLAY NAME WAS WRITE-ONCE, AND THAT ONLY SHOWED WHEN ONE CHANGED
 * ============================================================================
 *
 * `name`, `short_name` and `description` were written on INSERT and never
 * again. Invisible while nothing was ever renamed; the whole of the rename the
 * moment something was. `form_instance_overview` joins the template's name
 * LIVE, so a database seeded before the rename would go on calling the form
 * by its old name in the form selector, in Form Monitoring, in the chat card,
 * and in the filename of every PDF downloaded from any of them — including
 * for records filed years ago.
 *
 * Which is exactly why the rename has to travel this way rather than as a new
 * version: a version only reaches forms created after it.
 */
describe("a form the business has renamed", () => {
  /** The library as it stood before the rename, name and all. */
  async function databaseBeforeTheRename() {
    await ensureTemplateLibrary("system");
    const row = templateRow(CORRECTIVE);
    row.name = "Old Fixture Warning Slip";
    row.short_name = "OFWS";
    row.description = "The old description.";
  }

  it("brings the stored name into line with the seed", async () => {
    await databaseBeforeTheRename();

    const result = await ensureTemplateLibrary("system");

    expect(result.renamed).toContain(CORRECTIVE);
    expect(templateRow(CORRECTIVE).name).toBe("Fixture Corrective Notice");
    expect(templateRow(CORRECTIVE).short_name).toBe("Corrective Notice");
  });

  it("changes the label and nothing the data addresses", async () => {
    await databaseBeforeTheRename();
    const versionsBefore = JSON.stringify(versionsOf(CORRECTIVE));
    const currentBefore = JSON.stringify(currentVersionOf(CORRECTIVE));

    await ensureTemplateLibrary("system");

    // The key is the identity every filed instance points at.
    expect(templateRow(CORRECTIVE).key).toBe(CORRECTIVE);
    // The permission is what decides who may create it.
    expect(templateRow(CORRECTIVE).required_permission).toBe("create_forms");
    // No version was published, archived or edited by the rename.
    expect(JSON.stringify(versionsOf(CORRECTIVE))).toBe(versionsBefore);
    expect(JSON.stringify(currentVersionOf(CORRECTIVE))).toBe(currentBefore);
  });

  it("writes nothing when the database is already current", async () => {
    await ensureTemplateLibrary("system");
    const before = JSON.stringify(store);

    const again = await ensureTemplateLibrary("system");

    expect(again.renamed).toEqual([]);
    expect(JSON.stringify(store)).toBe(before);
  });

  /*
   * The whole published library, swept. The rename is only finished when no
   * seeded row carries the old name in any of the three display columns.
   */
  it("leaves no seeded template calling itself by the old name", async () => {
    await databaseBeforeTheRename();
    await ensureTemplateLibrary("system");

    for (const row of store.form_templates!) {
      const display = `${row.name} ${row.short_name} ${row.description}`;
      expect(display, String(row.key)).not.toMatch(/old fixture warning slip/i);
      expect(display, String(row.key)).not.toMatch(/\bOFWS\b/);
    }
  });
});

describe("a form the business has re-issued", () => {
  /**
   * A database as it was BEFORE this batch: the coaching note installed at
   * revision 1, carrying the superseded document.
   *
   * The DOCUMENT is put back as well as the counter. A database at revision 1
   * has revision 1's content, and the seeder now compares the two — so a
   * fixture that moved only the number would be testing nothing.
   */
  async function databaseAtRevisionOne() {
    await ensureTemplateLibrary("system");
    for (const row of versionsOf(COACHING)) {
      row.seed_revision = 1;
      row.document = SUPERSEDED_COACHING;
    }
  }

  it("publishes the new document as a NEW version and points the form at it", async () => {
    await databaseAtRevisionOne();

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual([COACHING]);
    expect(currentVersionOf(COACHING)).toMatchObject({
      version: 2,
      status: "published",
      seed_revision: coachingSeed.revision,
    });
    expect(currentVersionOf(COACHING)?.document).toEqual(coachingSeed.document);
  });

  it("keeps the old version, archived, so signed forms still render", async () => {
    await databaseAtRevisionOne();
    const originalId = currentVersionOf(COACHING)!.id;

    await ensureTemplateLibrary("system");

    const original = versionsOf(COACHING).find((row) => row.id === originalId);
    expect(original, "the superseded version was deleted").toBeTruthy();
    expect(original).toMatchObject({ status: "archived" });
    expect(original!.archived_at).toBeTruthy();
    // Two versions of one template — not two templates.
    expect(versionsOf(COACHING)).toHaveLength(2);
    expect(store.form_templates!.filter((row) => row.key === COACHING)).toHaveLength(1);
  });

  it("leaves every other template exactly where it was", async () => {
    await databaseAtRevisionOne();

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual([COACHING]);
    for (const key of [CORRECTIVE, "fixture-policy-review", REVIEW, "fixture-peer-review"]) {
      expect(versionsOf(key), key).toHaveLength(1);
      expect(currentVersionOf(key), key).toMatchObject({ version: 1 });
    }
  });

  it("does nothing when the published form already says what the seed says", async () => {
    /*
     * THE CASE THIS PROTECTS. A re-issued form can reach a database as a
     * published version BEFORE the code does — an administrator's draft
     * corrected and published against the official PDF. Without this check
     * the next deploy would publish a byte-identical version, archive theirs,
     * and leave two versions saying the same thing.
     */
    await ensureTemplateLibrary("system");
    // A database where a person published the new document as version 2, which
     // is what a `seed_revision` of 1 looks like after the column is added.
    for (const row of versionsOf(COACHING)) row.seed_revision = 1;

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual([]);
    expect(result.heldBack).toEqual([]);
    expect(result.existing).toContain(COACHING);
    expect(versionsOf(COACHING)).toHaveLength(1);
  });

  it("publishes a revision that changed only the READINGS the form prints", async () => {
    /*
     * ======================================================================
     * THE HALF THE ALREADY-CORRECT CHECK USED TO MISS
     * ======================================================================
     *
     * A version carries two things: the blocks, and the variants they are
     * printed for. `{{role}}` and `{{roleAbbr}}` resolve from the VARIANT, so
     * a revision that changes only the pairing changes every role word on the
     * page and nothing in the document.
     *
     * A variant naming the wrong role puts the wrong role word on every page
     * under a correct title, and a document-only comparison would declare the
     * database already correct and publish nothing, silently.
     */
    await ensureTemplateLibrary("system");
    const review = TEMPLATE_SEEDS.find((seed) => seed.key === REVIEW)!;
    for (const row of versionsOf(REVIEW)) {
      // One revision behind, with the same document and the OLD pairing.
      row.seed_revision = review.revision - 1;
      row.variants = [
        { key: "lead", label: "Lead review", role: "Old Role Name", roleAbbr: "ORN" },
      ];
    }

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toContain(REVIEW);
    expect(currentVersionOf(REVIEW)).toMatchObject({
      version: 2,
      status: "published",
      seed_revision: review.revision,
    });
    expect(currentVersionOf(REVIEW)?.variants).toEqual(review.variants);
  });

  it("still does nothing when the document AND the readings already match", async () => {
    await ensureTemplateLibrary("system");
    for (const row of versionsOf(REVIEW)) row.seed_revision = 1;

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual([]);
    expect(versionsOf(REVIEW)).toHaveLength(1);
  });

  it("publishes it once, not on every visit to the page", async () => {
    await databaseAtRevisionOne();
    await ensureTemplateLibrary("system");

    const again = await ensureTemplateLibrary("system");

    expect(again.revised).toEqual([]);
    expect(versionsOf(COACHING)).toHaveLength(2);
  });
});

describe("a form already filed against an older revision", () => {
  it("stays pinned to that revision, and untouched, when the template moves on", async () => {
    await ensureTemplateLibrary("system");
    for (const row of versionsOf(COACHING)) {
      row.seed_revision = 1;
      row.document = SUPERSEDED_COACHING;
    }
    const revisionOne = currentVersionOf(COACHING)!;
    // A filed form as the database holds it: pinned to revision 1, with its answers.
    store.form_instances = [
      {
        id: "filed-coaching",
        template_id: templateRow(COACHING).id,
        template_version_id: revisionOne.id,
        status: "finalized",
        employee_name: "Jane Smith",
      },
    ];
    store.form_instance_values = [
      { instance_id: "filed-coaching", field_key: "coaching_details", value: "Discussed greeting guests.", checked: [], filled_by: "ai" },
      { instance_id: "filed-coaching", field_key: "coaching_topics", value: null, checked: ["old_topic_one"], filled_by: "manager" },
    ];
    const before = JSON.stringify({ instances: store.form_instances, values: store.form_instance_values, v1: revisionOne });

    await ensureTemplateLibrary("system");

    // The template moved on; the filed form, its answers and its version did not.
    expect(currentVersionOf(COACHING)!.id).not.toBe(revisionOne.id);
    const parsed = JSON.parse(before);
    expect(store.form_instances).toEqual(parsed.instances);
    expect(store.form_instance_values).toEqual(parsed.values);
    // Revision 1's version row is only archived: its number, content and revision are as they were.
    const after = versionsOf(COACHING).find((row) => row.id === revisionOne.id)!;
    expect(after).toMatchObject({
      version: parsed.v1.version,
      seed_revision: 1,
      status: "archived",
      document: SUPERSEDED_COACHING,
    });
    store.form_instances = [];
    store.form_instance_values = [];
  });
});

describe("standing down", () => {
  it("will not publish over a version a person authored", async () => {
    await ensureTemplateLibrary("system");
    for (const row of versionsOf(COACHING)) row.seed_revision = 1;
    // An administrator published their own version — `openDraft` marks it 0.
    const template = templateRow(COACHING);
    store.form_template_versions.push({
      id: "authored-1",
      template_id: template.id,
      version: 2,
      status: "published",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 0,
      notes: "Cloned from version 1.",
      created_by: "dana",
    });

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual([]);
    expect(result.heldBack.map((entry) => entry.key)).toEqual([COACHING]);
    expect(result.heldBack[0].reason).toContain("authored here");
    expect(versionsOf(COACHING)).toHaveLength(2);
  });

  it("will not publish under an open draft", async () => {
    await ensureTemplateLibrary("system");
    for (const row of versionsOf(COACHING)) row.seed_revision = 1;
    const template = templateRow(COACHING);
    store.form_template_versions.push({
      id: "draft-1",
      template_id: template.id,
      version: 2,
      status: "draft",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 1,
      notes: "Cloned from version 1.",
      created_by: "system",
    });

    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual([]);
    expect(result.heldBack[0]?.reason).toContain("draft");
  });
});

describe("the migration the seeding depends on", () => {
  /*
   * A FAKE CLIENT CANNOT PROVE A SCHEMA. The tests above run against an
   * in-memory store that would happily accept a column Postgres does not have,
   * so the three things the seeder writes are asserted against the migration
   * SQL itself — which is the artefact that has to be applied for any of this
   * to work on a real database.
   */
  const sql = readFileSync(
    "supabase/migrations/20260907001000_forms_template_category.sql",
    "utf8",
  );
  const engine = readFileSync("supabase/migrations/20260904001000_forms_engine.sql", "utf8");

  it("declares every layout family a seed can carry", () => {
    const declared = engine.slice(
      engine.indexOf("create type public.form_layout_family"),
      engine.indexOf(");", engine.indexOf("create type public.form_layout_family")),
    );
    for (const family of FORM_LAYOUT_FAMILIES) expect(declared, family).toContain(`'${family}'`);
    for (const seed of TEMPLATE_SEEDS) expect(declared, seed.key).toContain(`'${seed.layoutFamily}'`);
  });

  it("adds the category column the page groups by, defaulting to the configured group", () => {
    expect(sql).toMatch(/alter table public\.form_templates\s+add column if not exists category/i);
    expect(sql).toContain(`default '${DEFAULT_COMPANY_FORM_CATEGORY}'`);
  });

  it("adds the seed revision column, defaulting to the revision already installed", () => {
    expect(sql).toMatch(
      /alter table public\.form_template_versions\s+add column if not exists seed_revision integer not null default 1/i,
    );
  });

  it("adds nothing destructive", () => {
    // Reversibility is the promise this migration was written under. The one
    // irreversible line — an enum value, which Postgres cannot drop — is stated
    // in the file's own header rather than hidden.
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
  });
});

describe("the migration the proposal drafts depend on", () => {
  const sql = readFileSync(
    "supabase/migrations/20260907002000_forms_version_proposal.sql",
    "utf8",
  );

  it("adds the column a proposed draft records its source in", () => {
    expect(sql).toMatch(
      /alter table public\.form_template_versions\s+add column if not exists proposal jsonb not null default/i,
    );
  });

  it("adds nothing destructive, and nothing that publishes anything", () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    // Which version is current is not this column's business, and a migration
    // that touched that table would be changing live forms on deploy.
    expect(sql).not.toMatch(/form_template_current/i);
  });
});
