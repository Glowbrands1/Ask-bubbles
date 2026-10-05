import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/company/forms", async () =>
  (await import("@/test/forms/fixture-forms")).fixtureFormsModule(),
);
vi.mock("@/config/company/forms/categories", async () =>
  (await import("@/test/forms/fixture-categories")).fixtureCategoriesModule(),
);

import { buildFormInventory } from "@/lib/forms/inventory";
import type { TemplateSummary } from "@/lib/forms/repository";

import { answerInventoryQuestion, buildFormInventoryBlock } from "./form-answers";

/**
 * ============================================================================
 * THE ANSWERS THAT PUT FORMS IN FRONT OF SOMEBODY
 * ============================================================================
 *
 * `form-proposal.test.ts` covers the cards. This covers the sentences: the
 * server-written lists Bubbles gives when a manager asks which form to use, and
 * the block the model is handed for every other turn.
 *
 * The rule being pinned is the same one either way. A form the registry keeps
 * out of the chooser is withheld from what Bubbles OFFERS — and it is still
 * published, still named honestly when somebody asks after it, and still in
 * the library whose categories the location answer describes.
 *
 * The registry is the fixture one (`src/test/forms/fixture-forms.ts`), whose
 * interview guide is the withheld form.
 */

function summary(overrides: Partial<TemplateSummary> = {}): TemplateSummary {
  return {
    id: `tpl-${overrides.key ?? "fixture-coaching"}`,
    key: "fixture-coaching",
    name: "Fixture Coaching Note",
    shortName: "Coaching Note",
    description: "A fixture coaching record.",
    category: "fixture-team",
    layoutFamily: "coaching",
    requiredPermission: "create_forms",
    active: true,
    displayOrder: 1,
    currentVersion: { id: "v1", status: "published" },
    draftVersion: null,
    versionCount: 1,
    activeAsset: null,
    assetCount: 0,
    ...overrides,
  } as unknown as TemplateSummary;
}

const INTERVIEW = summary({
  key: "fixture-interview",
  name: "Fixture Interview Guide",
  shortName: "Interview Guide",
  description: "A fixture interview guide.",
  category: "fixture-hiring",
  layoutFamily: "interview",
  displayOrder: 10,
} as unknown as Partial<TemplateSummary>);

const WITHHELD = [INTERVIEW];

const LIBRARY: TemplateSummary[] = [
  summary(),
  summary({
    key: "fixture-corrective",
    name: "Fixture Corrective Notice",
    shortName: "Corrective Notice",
    description: "A fixture corrective notice.",
    layoutFamily: "corrective",
    displayOrder: 2,
  } as Partial<TemplateSummary>),
  ...WITHHELD,
];

const inventory = () =>
  buildFormInventory(LIBRARY, { role: "location_manager", scope: null });

describe('"which form should I use?"', () => {
  it("lists what a location manager can start, without the withheld form", () => {
    const answer = answerInventoryQuestion({
      question: { kind: "list" },
      inventory: inventory(),
      role: "location_manager",
      namedTemplateKey: null,
    });

    expect(answer!.content).toContain("Fixture Coaching Note");
    expect(answer!.content).toContain("Fixture Corrective Notice");
    for (const entry of WITHHELD) {
      expect(answer!.content, entry.name).not.toContain(entry.name);
    }
    // The category heading goes with its forms rather than printing empty.
    expect(answer!.content).not.toContain("Fixture Hiring Forms");
  });
});

describe('"do we have an interview guide?"', () => {
  it("still says yes, because withheld is not retired", () => {
    const answer = answerInventoryQuestion({
      question: { kind: "availability" },
      inventory: inventory(),
      role: "location_manager",
      namedTemplateKey: "fixture-interview",
    });

    expect(answer!.content).toContain("Fixture Interview Guide");
    expect(answer!.content).toMatch(/^Yes/);
  });

  it("does not offer one as a substitute for a form that does not exist", () => {
    const answer = answerInventoryQuestion({
      question: { kind: "availability" },
      inventory: inventory(),
      role: "location_manager",
      namedTemplateKey: "role-play-evaluation",
    });

    expect(answer!.content).toMatch(/no published template for that/i);
    for (const entry of WITHHELD) {
      expect(answer!.content, entry.name).not.toContain(entry.name);
    }
  });
});

describe('"where are the forms?"', () => {
  it("still describes every heading of the forms library", () => {
    /*
     * This names no form — it names the library's categories, and one of them
     * holds only the withheld form. It also must not send anybody to a Create
     * a Form screen: forms are only created in chat.
     */
    const answer = answerInventoryQuestion({
      question: { kind: "location" },
      inventory: inventory(),
      role: "location_manager",
      namedTemplateKey: null,
    });

    expect(answer!.content).toContain("Fixture Team Forms");
    expect(answer!.content).toContain("Fixture Hiring Forms");
    expect(answer!.content).toContain("**Ask Bubbles**, right here");
    expect(answer!.content).not.toContain("Create a Form");
  });
});

describe("the FORMS LIBRARY block the model is given", () => {
  const block = () => buildFormInventoryBlock(inventory());

  it("still lists the withheld form, because it still exists", () => {
    for (const entry of WITHHELD) {
      expect(block(), entry.name).toContain(entry.name);
    }
  });

  it("marks it NOT OFFERED, and marks nothing else", () => {
    const marked = block()
      .split("\n")
      .filter((line) => line.includes("NOT OFFERED —"))
      .join("\n");

    for (const entry of WITHHELD) {
      expect(marked, entry.name).toContain(entry.name);
    }
    expect(marked).not.toContain("Fixture Coaching Note");
    expect(marked).not.toContain("Fixture Corrective Notice");
  });

  it("says what the marker means, so the rule travels with the list", () => {
    expect(block()).toMatch(/never suggest/i);
    expect(block()).toMatch(/answer honestly if the user asks about it by name/i);
  });
});
