/**
 * ============================================================================
 * THE APP'S OWN CITATION LINE AT THE END OF A NARRATIVE FIELD
 * (ported from the sibling app, its production-flags read, 5 Nov 2026; read here by the made-about policy line)
 * ============================================================================
 *
 * With POLICY_CITATION_ENABLED, or EDIT_POLICY_ASK_ENABLED's "please list the policy", the app appends, to a Coaching
 * Form's Details or a Follow-Up's narrative field, exactly this line (`flaggedCitationWrite`, `ai/policy-citation-fields.ts`):
 *
 *   "\n\nPolicy reference: <Heading> Policy, JBA Policy Manual p.N[; <Heading> Policy, JBA Policy Manual p.N]…"
 *
 * Each citation is `formatManualCitation`'s shape, as written into a narrative field: no final full stop, citations
 * joined by "; ". Only that exact line, as the field's LAST paragraph, is matched. A "Policy reference" a manager typed
 * anywhere else in the text is left alone. No words are read; only the line's fixed shape.
 */
const CITATION = String.raw`[^;\n]+?, JBA Policy Manual(?: p\.\d+)?`;
const APP_CITATION_LINE = new RegExp(String.raw`(?:^|\n\n)(Policy reference: ${CITATION}(?:; ${CITATION})*)$`);

/** The field's text without its trailing app citation line, and that line ("Policy reference: …"), or null. */
export function splitAppCitationLine(value: string): { body: string; line: string | null } {
  const text = value.trim();
  const match = APP_CITATION_LINE.exec(text);
  if (!match) return { body: text, line: null };
  return { body: text.slice(0, match.index).trim(), line: match[1]! };
}
