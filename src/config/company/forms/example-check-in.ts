import { field, type TemplateSeed } from "@/lib/forms/catalog";
import type { FormDocument } from "@/lib/forms/document";

import { FORM_LETTERHEAD_BRAND } from "./letterhead";

/**
 * ============================================================================
 * EXAMPLE — NOT A BUFF CITY SOAP FORM
 * ============================================================================
 *
 * A placeholder that exercises the forms engine end to end: system fields
 * filled from the record, one field the assistant drafts, a checkbox group,
 * a field the manager completes, and hand signatures. It exists so the
 * platform can be tested before Buff City Soap supplies its real forms.
 *
 * It is labelled as an example in its NAME, its CATEGORY, its DESCRIPTION and
 * on the printed page itself, so it cannot be mistaken for approved HR
 * paperwork. Delete it from `index.ts` when the real catalog arrives.
 */
export const EXAMPLE_CHECK_IN_KEY = "example-check-in";

function exampleCheckInDocument(): FormDocument {
  return {
    paper: "letter",
    style: {
      headingStyle: "rule",
      letterhead: "centered",
      margins: "wide",
      signatureLayout: "ruled",
    },
    blocks: [
      { kind: "letterhead", brand: FORM_LETTERHEAD_BRAND, title: "Team Member Check-In (Example)" },
      {
        kind: "note",
        text: "EXAMPLE FORM — not an approved Buff City Soap form. For testing the Ask Bubbles forms workflow only; do not file as an HR record.",
      },

      { kind: "section", label: "Team Member" },
      {
        kind: "field_row",
        fields: [
          field("employee_name", "Name", "system"),
          field("form_date", "Date", "system", "date"),
        ],
      },
      {
        kind: "field_row",
        fields: [
          field("job_title", "Job Title", "system"),
          field("location", "Location", "system"),
        ],
      },

      { kind: "section", label: "Topics Discussed" },
      {
        kind: "checkbox_group",
        key: "topics",
        options: [
          { key: "guest_experience", label: "Guest Experience" },
          { key: "product_knowledge", label: "Product Knowledge" },
          { key: "store_operations", label: "Store Operations" },
          { key: "scheduling", label: "Scheduling" },
          { key: "recognition", label: "Recognition" },
          { key: "other", label: "Other" },
        ],
        responsibility: "ai",
        columns: 3,
      },

      { kind: "section", label: "Conversation" },
      {
        kind: "field",
        field: field("summary", "Summary of the conversation", "ai", "long_text", {
          help: "What was discussed, in the manager's own account. No policy language.",
          minLines: 5,
        }),
      },
      {
        kind: "field",
        field: field("next_steps", "Agreed next steps", "manager", "long_text", { minLines: 3 }),
      },

      { kind: "signature_row", label: "Manager Signature", dateLabel: "Date" },
      { kind: "signature_row", label: "Team Member Signature", dateLabel: "Date" },
    ],
  };
}

export const EXAMPLE_CHECK_IN_SEED: TemplateSeed = {
  key: EXAMPLE_CHECK_IN_KEY,
  name: "Team Member Check-In (Example)",
  shortName: "Check-In (Example)",
  description:
    "EXAMPLE ONLY — not an approved Buff City Soap form. Exercises the forms workflow until the real catalog is supplied.",
  // RETIRED (not seeded): kept so the placeholder's definition is on record.
  category: "hr_performance",
  layoutFamily: "standard",
  requiredPermission: "create_forms",
  displayOrder: 1,
  document: exampleCheckInDocument(),
  variants: [],
  revision: 1,
  revisionNote: "Platform example. Not derived from any Buff City Soap source form.",
  bundledPdfName: "Team Member Check-In (Example).pdf",
};
