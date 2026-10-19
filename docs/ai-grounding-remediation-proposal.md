# AI drafting safety: stop treating Sun Tan City content as Buff City Soap policy

**Status: proposal only.** Nothing here is implemented. No knowledge-base document, chunk, tag or Woven record has been read for write, changed or removed, and Ask Sunny is untouched. Evidence comes from read-only queries and from reading the code at `main` (`3304e92`).

## 1. What happens today (evidence)

| # | Fact | Where |
|---|---|---|
| 1 | The *Performance Management Framework* (88 chunks, uploaded 2026-10-08, tag `performance-management-framework`) is a **pinned role document**. For governed drafts (coaching, corrective action, policy review, follow-up, EPPs) up to 16 chunks across 12 heading groups are inserted in the prompt as "the approved progression; reason from this, do not restate it". | `PINNED_KNOWLEDGE_ROLES`, `maxMandatoryChunks` (`src/config/company/knowledge.ts`); draft route `progressionBlock` |
| 2 | **Fail-closed safeguards exist and must stay:** document missing / ambiguous (two tagged documents) / query failed / no mandatory chunks / incomplete rule groups all block the draft. | `role-grounding.ts`, `document-roles.ts`, `framework-availability.ts` |
| 3 | The Framework is Sun Tan City text. Of its 88 chunks, **50 contain legacy-specific terms**: 29 name the company/services (Sun Tan City, salon, tanning), 30 name metrics/tools (PPTA, LPSVA, UPTA, Club Close, Spa %, OTC, ASTC, Routine Mat, Bonus Viewer, Comp Report), 5 use role codes (SDIT, TSD, ASD, FTTC, Salon Director). | read-only query |
| 4 | It was adopted **verbatim** on 8 Oct 2026 by an explicit owner decision (app name removed; company, role titles and rules left in place and *flagged for later decision*). It is legacy methodology, not Buff policy. | `scripts/knowledge/framework-debrand.mjs` |
| 5 | Policy quotations on forms come from the **JBA Policy Manual**, already brand-scoped: other brands' sections, labelled blocks and bullets are dropped from retrieval, handbook coverage and citations; kept text is verbatim. | `POLICY_MANUAL_BRAND_SCOPE`, `brand-sections.ts` |
| 6 | I found **no retrieval of the Buff operations documents** (MRM, 7G Service, Core Values, Revel, Domo) in the form-drafting path, so drafts have no verified Buff vocabulary to draw on. They are in general Q&A retrieval only. | draft route imports |
| 7 | The Framework's chunks are also ordinary retrievable chunks in general Q&A, not only when pinned. | `server-ask.ts` |

## 2. Why not a keyword filter
Stripping lines that contain "tanning", "salon", "PPTA" and so on would:
- remove **57 %** of the Framework (50 of 88 chunks), including text inside the *required* rule groups (coaching structure, escalation, follow-up, self-check), which would trip the existing fail-closed `incomplete_rule_groups` guard and block every governed draft;
- delete methodology that merely *illustrates* itself with a Sun Tan City example, along with the principle;
- also catch a manager's **own** words ("her Club Close is low") and quoted policy text, which must be preserved;
- hide the problem instead of recording provenance.

## 3. Recommended architecture: source-aware grounding

Principle: **classify and label sources by origin and authority, decide per segment what may reach the model, and say so explicitly when Buff has no guidance.** Nothing is deleted from the knowledge base; verbatim text and locators are preserved.

### 3.1 Provenance registry (configuration, no data change)
`KNOWLEDGE_PROVENANCE` in `config/company/knowledge.ts`, resolved like the pinned roles (tag first, title fallback, ambiguity = failure):

| Origin | Authority | Examples | Rule |
|---|---|---|---|
| `buff_official` | terminology, roles, values, operations | MRM, *Purpose & Core Values*, *7G Service*, Revel and Domo guides | May be cited as Buff fact for what they say |
| `company_multi_brand` | policy (company-wide and Buff-labelled sections only) | JBA Policy Manual | Existing brand scope applies unchanged; quoted verbatim with page/section |
| `legacy_stc` | **methodology only** | Performance Management Framework | Never a source of Buff roles, metrics, tools, policies or company facts |
| `woven_structured` | current job titles | `woven_position_map`, directory | Source of truth for titles |

An optional KB tag (e.g. `legacy-sun-tan-city`) can mirror the registry later; the registry works without touching a document.

### 3.2 Segment classifier (pure function, like `readManualForBrand`)
For each pinned chunk, split into sentences/bullets and label each segment:
- `methodology` — how to observe, document, escalate and follow up (kept);
- `legacy_specific` — asserts a Sun Tan City **fact**: organisation, role code, metric, tool, service or policy;
- `ambiguous` — mixed; treated as `legacy_specific` (conservative) **and listed** for human review.

Labelling is by **concept** (registry of concepts: `stc_org`, `stc_role_codes`, `stc_sales_metrics`, `stc_tools`, `stc_services`), each with the contexts it counts in — not by bare words. A golden file of the shipped Framework (every segment, its label and concept) is committed and **reviewed by Buff once**; any change to the Framework produces a diff to review.

### 3.3 Prompt assembly (what the model sees)
1. **Methodology block** — only `methodology` segments, verbatim, with their original `[document — locator]` headers; headings used by the required rule groups are preserved.
2. **Buff vocabulary block** — built from a small curated config of *confirmed* facts: "guest"; Core Values (Safety, Resilience, Joy, Belonging); 7G Service step names; confirmed titles (District Manager, DMIT; plus any role the business approves). Each entry carries its source document.
3. **Explicit gaps block** — a list of topics for which "**No Buff City Soap guidance on file**": Tanning Consultant/FTTC roles, SDIT/TSD, sales KPIs (PPTA…), Bonus Viewer, SVC, key-deduction amount, etc. The prompt says: do not state, invent or substitute; leave the field blank or ask the manager (the same rule the forms already apply to figures "as provided").
4. **Legacy notice** — "The methodology above comes from a legacy Sun Tan City document. Its examples, role titles, metrics and tools are not Buff policy."
`legacy_specific` segments are **withheld from the prompt and recorded** (document, locator, concept) in the provenance record; they are not deleted anywhere.

### 3.4 Required-reference safeguards stay, and gain one check
- All existing role-grounding failures are unchanged.
- New check: after classification, every **required group** must still have ≥ 1 `methodology` segment. If not, fail closed with a new code (`legacy_only_group`) and the same manager-facing unavailable message — never a silent downgrade.
- JBA path unchanged; its retained "client" wording is quoted verbatim.

### 3.5 Output verification by provenance, not by keyword
After drafting, a guard checks generated fields for **assertions of legacy concepts as Buff fact** and blanks the field with a manager-visible note ("No Buff City Soap guidance on file for <topic>"). It does **not** act when:
- the concept comes from the **manager's own words** or the form's own fields (exempt, as in `policy-claim-guard.ts`);
- the text is a **cited verbatim quotation** from an approved source;
- the concept is explicitly *confirmed* in the Buff vocabulary block.
Hits are logged as structured, redacted events (same pattern as the template sync).

### 3.6 Citations and provenance
- Every grounding row carries `{documentId, title, locator, origin, authority, classification}`.
- The draft's `sources` list shows an origin label; legacy citations read "Legacy methodology — not Buff policy".
- A small provenance record (registry version, withheld segments, gaps shown) is stored with the draft, so historical forms stay explainable. Nothing about existing instances is rewritten.

### 3.7 General Q&A
Legacy-origin chunks are excluded from general retrieval except for performance-management questions, where they are returned with the legacy label.

### 3.8 Replacement path
When Buff supplies its own framework, upload it as a **new version of the tagged document** (the KB keeps `version`, `previous_versions`, `superseded_by`), never as a second tagged document. The registry then flips that document to `buff_official` with no code change.

### 3.9 Rollout (safe by construction)
1. **Shadow mode** behind a flag: classify and log what *would* be withheld; prompts byte-identical to today.
2. Buff reviews the golden classification file.
3. **Enforce** per template family (coaching/CA first, EPPs last), with the flag as a kill switch.
4. No migration, no KB write at any step.

## 4. How this meets the seven requirements
| Requirement | Mechanism |
|---|---|
| 1 Identify legacy documents and chunks | Provenance registry + per-segment classification with a reviewed golden file |
| 2 Stop unsupported tanning content being presented as Buff policy | Withhold `legacy_specific` segments; legacy notice; output provenance guard; labelled citations |
| 3 Preserve valid company-wide HR guidance | `methodology` segments kept verbatim; JBA brand-scoped path untouched |
| 4 Use verified Buff knowledge | Buff vocabulary block from confirmed documents (guest, values, 7G, confirmed titles) |
| 5 Handle missing Buff guidance explicitly | Gaps block + blank-with-note behaviour; "No Buff City Soap guidance on file" |
| 6 Keep the workflow and required-reference safeguards | All fail-closed codes unchanged; one added check; shadow mode first |
| 7 Citation accuracy and provenance | Rows keep document/locator; origin labels; provenance record; no re-wording of quotes |

## 5. Regression tests (to write before enforcing)
1. **Role resolution unchanged:** tag, fallback title, ambiguity refusal, query failure (existing `performance-management-role.test.ts`, `framework-readiness.test.ts`).
2. **Fail-closed preserved:** framework missing → governed drafts blocked; incomplete groups → blocked.
3. **Required groups survive classification:** against the shipped Framework chunks, all 12 groups retain ≥ 1 methodology segment; new `legacy_only_group` failure is tested with a synthetic legacy-only group.
4. **Classifier golden test:** reviewed segment-by-segment labels; Spa %, Club Close, PPTA, Routine Mat, Bonus Viewer, SDIT/TSD/ASD role codes, "Sun Tan City" assertions → `legacy_specific`; observe → expectation → follow-up, escalation and documentation principles → `methodology`; mixed → `ambiguous` and listed.
5. **Prompt assembly:** withheld text absent from the prompt; Buff vocabulary and gaps blocks present; legacy notice present; row headers keep `[title — locator]`.
6. **Shadow mode equivalence:** with the flag off the prompt is byte-identical to today's, and the would-withhold log is produced.
7. **Output guard:** mocked model output echoing legacy concepts is blanked with the gap note; the same terms typed by the manager are preserved; cited verbatim policy text is preserved; concepts confirmed in the vocabulary block are allowed.
8. **JBA unchanged:** brand-scope tests and verbatim "client" quotations pass untouched; citations still carry page and section.
9. **Provenance:** `sources` carry origin and classification; the stored provenance record is written for new drafts and absent for historical instances (which are not modified).
10. **General Q&A:** legacy chunks excluded/labelled per policy; other Buff documents unaffected.
11. **No knowledge writes:** tests assert no insert/update/delete on `knowledge_documents` or `knowledge_chunks`.
12. **Drafting suites:** the EPP, coaching, corrective-action, exit and hiring conversation tests pass unchanged in shadow mode and with enforcement on.

## 6. Decisions needed from you
1. Approve shadow-mode first, then enforcement.
2. **Withhold** legacy segments (recommended) versus include them labelled.
3. Who reviews the golden classification file for Buff.
4. Whether to add the `legacy-sun-tan-city` tag to the Framework later (a metadata edit; not done now).
5. Content of the Buff vocabulary block (initially: guest, Core Values, 7G Service, District Manager/DMIT).
6. Whether general Q&A should exclude the legacy document by default.
