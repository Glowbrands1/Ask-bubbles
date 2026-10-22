# Policy source for Corrective Action forms — validation, 22 Oct 2026

Read-only investigation. No code, configuration or data was changed. Database
evidence is from `SELECT`s against the Ask Bubbles production Supabase project.

## 1. How the manual is chosen at runtime

| Step | Where | What it does |
|---|---|---|
| Brand scope | `src/config/company/brand.ts:45` | `knowledgeScopeId: "bcs-core"` |
| Candidates | `src/lib/knowledge/providers/supabase.ts:409` (`fetchOfficialPolicyManual`) | indexed `knowledge_documents` in scope `bcs-core` |
| Identity | `src/lib/forms/official-policy-manual.ts:115-124, 211` | 1) tag `official-policy-manual`; else 2) file name starting `JBA-Policy-Manual`; else 3) title starting `JBA Policy Manual` or `2025 JBA Policy Manual` |
| Brand filter | `src/config/company/knowledge.ts:424-474` (`MULTI_BRAND_MANUAL_TITLES`, `POLICY_MANUAL_BRAND_SCOPE`), applied in the provider (`supabase.ts:33,165`) | The JBA manual covers every JB & Associates brand; Sun Tan City / STC / Crunch sections and labelled blocks are dropped from retrieval and from every citation |

**What it resolves to today.** One JBA row exists in the database, matched by
the title tier (its file name `2025-JBA-…` does not match the file-name prefix):

| id | title | file | source | category | tags | status |
|---|---|---|---|---|---|---|
| `81622d77-ee6c-55f6-904d-dee057907a13` | 2025 JBA Policy Manual - Edited 5-2025 | 2025-JBA-Policy-Manual-Edited-5-2025.pdf | woven | policies_compliance | woven, woven-handbook | indexed (created 2026-10-08) |

The 21 Oct Corrective Action forms cite it with `matchedBy: "fallback"`.

Sync record: `knowledge_sync_items` `c7da3f69-2dee-46af-869d-5ff1b9b0878a` —
Woven handbook `42486200-20b0-415c-9bad-c4425bc096ce`, **Published**, audience
**Public**, synced 2026-10-08. The Woven policy record "JBA Policy Manual 2025"
(`3e9c11d4-…`) is **EXCLUDED** (`publication_unverified`) and is not in the
knowledge base.

## 2. Approval status

- **Explicit, recorded approval of the document for this tenant exists.**
  `src/config/company/woven.ts:70-108` holds every Woven record whose title names
  JBA / JB & Associates / Sun Tan City / STC as NEEDS_REVIEW
  (`ownership_review`). There is no automatic release. Only ids in
  `confirmedEntityIds` are ingested, and that list has one entry:
  `42486200-20b0-415c-9bad-c4425bc096ce`, "confirmed for Buff City Soap by
  the owner on 8 Oct 2026". It was added in commit `214fd84` (2026-10-08).
- `knowledge_sync_audience_decisions`: `public → company_wide`, decided by
  an administrator on 2026-10-08.
- **What is still heuristic:** the step from "approved document in the
  knowledge base" to "the manual a Corrective Action cites" is a title-prefix
  match. The document carries no `official-policy-manual` tag. Today the
  approved document is the only candidate, so the two coincide.

## 3. Tenant isolation

- Separate Supabase project. Every knowledge row is scope `bcs-core` (125
  indexed, 2 failed, 3 retired); no `stc-core` row exists.
- Woven connector pinned to Midwest Soap Makers; a JB & Associates or Sun Tan
  City session or company id is rejected. See
  `src/lib/knowledge-sync/woven/bcs/tenant-isolation.test.ts` (passes on the
  feature branch). Its check 12 forbids production modules from naming another
  company; the feature branch tripped it once with a code comment, and that
  comment is fixed.
- The multi-brand manual is read through `POLICY_MANUAL_BRAND_SCOPE`, so
  another brand's sections never reach a citation.

## 4. Fail-closed behaviour

As in Ask Sunny: a missing or ambiguous manual returns `ok: false`, the draft is
still created with blank policy fields, and a policy value is written only with
`provenance.verified: true`. Finalize asks for an acknowledgement for any
unverified policy field.

Proposal lines mentioning a policy before the draft:

- **Standards of Conduct:** a suggestion conditional on the manual ("…if the
  manual doesn't support it, I'll leave the policy for you").
- **Missed meeting** (feature branch, 22 Oct): "this reads as **Attendance** —
  a required meeting that was missed. I'll quote that section … under
  **Absenteeism**". This is a suggestion but **not** conditional on the manual.
  The draft ticks Absenteeism without checking the manual. The quote itself
  stays verified or blank.

## 5. What the business needs to decide (nothing changed here)

1. Optionally, tag `81622d77-…` `official-policy-manual` in the Knowledge Base,
   so the citation follows the approved id rather than a title prefix. A
   re-issued manual with another title would otherwise stop matching (fail
   closed).

## Recommended code change

Same as Ask Sunny: word the Attendance proposal line conditionally, and apply
the Absenteeism tick only when the pinned manual's Attendance section contains
"Seminars/Meetings/ Training sessions are considered scheduled shifts" (an
`ANCHORS`-style check). Otherwise leave the model's box, as
`groundConductPolicy` does.

## Changes made on the feature branch (uncommitted, 22 Oct 2026)

- **Missed meeting → Attendance is grounded in the manual.** `describedOffenseKeys` ticks Absenteeism only when the pinned manual's Attendance section, as it reads today, says "Seminars/Meetings/ Training sessions are considered scheduled shifts". Without that line, or without a manual, the draft's own box stands. The chat line is worded as a suggestion to be checked against the manual, like the Standards of Conduct one. `src/lib/forms/ca-policy.ts`, `src/app/api/forms/instances/[id]/draft/route.ts`.
- No production configuration, tag or document was changed.
