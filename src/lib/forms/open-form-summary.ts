import "server-only";

import type { OpenFormSummary } from "@/lib/ai/types";

import { blocksForVariant, checkboxGroupsForVariant, fieldsForVariant, interpolate, parseFormDocument } from "./document";
import { authorizeInstance } from "./instance-scope";
import { unverifiedPolicyFields } from "./policy-verification";

/** Enough of a long field for the model to know what it says, not the whole record. */
const VALUE_CHARS = 600;

/**
 * ============================================================================
 * THE FORM THAT IS OPEN, FOR AN ORDINARY ANSWER
 * ============================================================================
 *
 * Ported from the reference platform (production feedback, 20 Oct 2026):
 * with a Corrective Action Form on screen, the assistant answered "No form has
 * been created yet — there's no draft card in this conversation". The answer
 * was written by a prompt that was never told the form existed, and was told
 * instead that no card ever comes with an answer.
 *
 * So a turn that names a created form, and that no correction or revision
 * handled, is answered KNOWING the form: which one, for whom, whether it is a
 * draft, and what it says now. Read with "view" authorization — the template's
 * own permission and the store scope — and null for anything that fails, so a
 * forged id tells the model nothing.
 */
export async function describeOpenForm(request: Request, instanceId: string): Promise<OpenFormSummary | null> {
  let loaded: Awaited<ReturnType<typeof authorizeInstance>>["loaded"];
  try {
    loaded = (await authorizeInstance(request, instanceId, "view")).loaded;
  } catch {
    return null;
  }
  const instance = loaded.instance;
  const document = parseFormDocument(loaded.version.document);
  const variantKey = instance.variantKey;
  const rows = new Map(loaded.values.map((row) => [row.fieldKey, row]));

  const lines: { label: string; value: string }[] = [];
  for (const field of fieldsForVariant(document, variantKey)) {
    const value = (rows.get(field.key)?.value ?? "").trim();
    if (value === "") continue;
    lines.push({ label: interpolate(field.label, null), value: clip(value) });
  }
  /* An unlabelled group is named by the section heading it prints under — "Type of Warning". */
  let heading: string | null = null;
  const headings = new Map<string, string>();
  for (const block of blocksForVariant(document, variantKey)) {
    if (block.kind === "section") heading = block.label;
    if (block.kind === "checkbox_group" && heading) headings.set(block.key, heading);
  }
  for (const group of checkboxGroupsForVariant(document, variantKey)) {
    const ticked = rows.get(group.key)?.checked ?? [];
    if (ticked.length === 0) continue;
    const labels = ticked.map((key) => group.options.find((option) => option.key === key)?.label ?? key);
    lines.push({ label: group.label?.trim() || headings.get(group.key) || humanize(group.key), value: labels.join(", ") });
  }

  return {
    templateName: instance.templateName,
    employeeName: instance.employeeName,
    status: instance.status === "draft" ? "draft" : "finalized",
    lines,
    unverifiedPolicy: unverifiedPolicyFields(document, variantKey, loaded.values).map((field) => field.label),
    cited: citedSectionsOf(fieldsForVariant(document, variantKey), rows),
  };
}

/**
 * The manual sections the policy lines cite, from provenance only an
 * official-manual quotation carries — never from the text, which a person
 * may have typed and which is clipped above.
 */
function citedSectionsOf(
  fields: readonly { key: string; policyGrounded?: boolean }[],
  rows: ReadonlyMap<string, { provenance?: Record<string, unknown> }>,
): string[] {
  const found = new Set<string>();
  for (const field of fields) {
    if (!field.policyGrounded) continue;
    const provenance = rows.get(field.key)?.provenance;
    if (!provenance || provenance.verified !== true || provenance.source !== "official_policy_manual") continue;
    for (const entry of Array.isArray(provenance.sections) ? provenance.sections : []) {
      const heading = (entry as { locator?: unknown } | null)?.locator;
      if (typeof heading === "string" && heading.trim() !== "") found.add(heading.trim());
    }
  }
  return [...found];
}

function clip(value: string): string {
  return value.length <= VALUE_CHARS ? value : `${value.slice(0, VALUE_CHARS).trimEnd()}…`;
}

function humanize(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
