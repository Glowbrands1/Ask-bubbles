import { vi } from "vitest";

/**
 * TEST FIXTURE CATEGORIES for the forms page, used with the fixture registry in
 * `fixture-forms.ts`. A LEAF MODULE on purpose: the real categories module is
 * imported by the forms catalog, so a mock of it must not import the catalog
 * back (directly or through the fixture forms) or the two wait on each other.
 *
 *   vi.mock("@/config/company/forms/categories", async () =>
 *     (await import("@/test/forms/fixture-categories")).fixtureCategoriesModule(),
 *   );
 */
export const FIXTURE_FORM_CATEGORIES = [
  {
    key: "fixture-team",
    label: "Fixture Team Forms",
    blurb: "Test fixtures for coaching, notices and reviews. Not Buff City Soap forms.",
  },
  {
    key: "fixture-separation",
    label: "Fixture Separation Forms",
    blurb: "Test fixture for a separation record. Not a Buff City Soap form.",
  },
  {
    key: "fixture-hiring",
    label: "Fixture Hiring Forms",
    blurb: "Test fixture for an interview guide. Not a Buff City Soap form.",
  },
  {
    key: "examples",
    label: "Examples — not approved Buff forms",
    blurb: "Placeholder forms that exercise the forms workflow.",
  },
] as const;

/** The shape of `@/config/company/forms/categories`, with the fixture categories. */
export async function fixtureCategoriesModule() {
  const actual = await vi.importActual<typeof import("@/config/company/forms/categories")>(
    "@/config/company/forms/categories",
  );
  return {
    ...actual,
    COMPANY_FORM_CATEGORIES: FIXTURE_FORM_CATEGORIES,
    DEFAULT_COMPANY_FORM_CATEGORY: "examples",
  };
}
