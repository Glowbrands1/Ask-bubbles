# AI grounding — implementation design (source-aware remediation)

**Status: design only. Not implemented, not deployed.** It builds on `docs/ai-grounding-remediation-proposal.md` and the evidence in `docs/buff-city-soap-form-content-audit.md`. No knowledge-base document or chunk is written, tagged, superseded or removed by anything below; Woven data and Ask Sunny are untouched; the existing required-reference safeguards are preserved.

## 1. Goals (from the review)
1. Distinguish **verified Buff policy**, **company-wide JBA policy**, **legacy methodology** and **Woven role data**.
2. Never present legacy Sun Tan City facts as current Buff policy.
3. Preserve legitimate HR guidance and **accurately attributed quotations**.
4. No keyword stripping; no fabricated replacement policy.
5. Keep the fail-closed role-grounding safeguards.
6. **Shadow mode** before any enforcement.
7. Regression tests for coaching, corrective action, performance plans and the other AI-generated HR documents.

## 2. Where it plugs in (today's flow)
`draft/route.ts` → `resolveRoleDocument` / `selectMandatoryChunks` (pins ≤16 Framework chunks over 12 rule groups) → `progressionBlock` ("approved progression; reason from this") + brand-scoped JBA manual retrieval (`readManualForBrand`) → model → existing guards (`policy-claim-guard.ts`, `stripUnsupportedPolicyAttributions`, narrative guards) → fields saved. The design inserts **three pure stages** around the unchanged retrieval and keeps every existing guard.

```
resolveRoleDocument ─► selectMandatoryChunks ─► [A] classifyChunks ─► [B] assembleGrounding ─► model
                                                                                                  │
 JBA manual (brand-scoped, verbatim) ───────────────────────────────────────────────────────────┤
                                                                                                  ▼
                                existing guards ◄── [C] provenance-aware output guard ◄── draft fields
```

## 3. New modules (all pure; no I/O except logging)

| Module | Responsibility |
|---|---|
| `src/config/company/provenance.ts` | **Registry**: for each knowledge document, `origin` ∈ `buff_official` · `company_multi_brand` · `legacy_stc` · (Woven structured data is separate), resolved by tag first then title fallback (same identity rules as pinned roles; two matches = failure). Holds the registry version. |
| `src/lib/knowledge/legacy-segments.ts` | `classifySegments(chunk)` → `[{text, label: methodology \| legacy_specific \| ambiguous, concept?}]`. Concept registry (`stc_org`, `stc_role_codes`, `stc_sales_metrics`, `stc_tools`, `stc_services`) with **contextual** patterns (e.g. "Spa %" as a metric, "Salon Director" as a title), not bare words. Ambiguous ⇒ treated as legacy and listed. |
| `src/config/company/buff-vocabulary.ts` | Small, **confirmed** facts only, each with its source document + section: guest; Core Values (Safety, Resilience, Joy, Belonging); 7G Service step names; District Manager/DMIT (MRM; Woven); any title the business later approves. |
| `src/lib/forms/grounding-assembly.ts` | `assembleGrounding({chunks, vocabulary, gaps, mode})` → `{methodologyBlock, vocabularyBlock, gapsBlock, legacyNotice, withheld[], provenance}`. Methodology rows keep their original `[document — locator]` header and verbatim text. |
| `src/config/company/knowledge-gaps.ts` | Topics with **"No Buff City Soap guidance on file"**: Tanning Consultant/FTTC/TC, SDIT/TSD, sales KPIs (PPTA…), Bonus Viewer, SVC, key-deduction amount, etc. Each gap says how to behave: leave blank or ask the manager. |
| `src/lib/forms/legacy-output-guard.ts` | Provenance-aware check of generated fields (section 6). |
| `src/lib/forms/grounding-mode.ts` | Reads `FORMS_GROUNDING_MODE` = `off` · `shadow` · `enforce` (per family, see 7). Production-only enforcement (Preview forced to `shadow`; same pattern as the template-sync policy). |

Nothing here reads or writes `knowledge_documents`/`knowledge_chunks` beyond the existing retrieval queries.

## 4. Classification rules (what "legacy" means, and what it does not)
- A segment is **legacy_specific** only if it **asserts a Sun Tan City fact**: company name as the employer; a role code as a Buff role (SDIT, TSD, ASD, FTTC, "Salon Director"); a sales metric or tool as the standard (PPTA, LPSVA, UPTA, Club Close, Spa %, OTC, ASTC, Bonus Viewer, Comp Report, Routine Mat); tanning/spa/sunless services; STC-only policy.
- A segment is **methodology** when it teaches *how*: observe behaviour, state the expectation, tie to impact, choose the lowest rung, document, follow up, escalate only on pattern. Principles that merely use an STC illustration are kept **minus the illustration sentence**, which is withheld as a separate segment — the principle stays verbatim.
- **Mixed** sentences are `ambiguous`: withheld and listed for the human review.
- The labels for the shipped Framework are stored in `src/test/fixtures/framework-segment-labels.json` (every segment, label, concept), **reviewed once by Buff**. Any later Framework version produces a diff to review before enforcement applies to it.

## 5. Prompt assembly (what the model sees)
1. **Methodology block** — only `methodology` segments, verbatim, each group's rows in document order with `[title — locator]`. The required rule groups (coaching structure, EPP routing, escalation, 6.4 policy verification, follow-up, self-check, final operating rule) must each keep ≥ 1 segment.
2. **Buff vocabulary block** — confirmed terms only, each with its source ("Buff City Soap – Purpose & Core Values").
3. **Gaps block** — "No Buff City Soap guidance on file for: …. Do not state, infer or substitute. Leave the field blank or ask the manager."
4. **Legacy notice** — "The methodology above comes from a legacy Sun Tan City document; its roles, metrics, tools and examples are not Buff policy."
JBA retrieval, the "Direct policy from official manual" quotation path, and every policy guard are **unchanged**; their text stays verbatim even where it says "client".

## 6. Output guard (source-aware, not a word filter)
After drafting, each generated field is checked for **assertions of legacy concepts as Buff fact**. It does **not** act when the concept:
- appears in the **manager's own words** or the form's own fields (exempt, like `policy-claim-guard.ts`);
- sits inside a **cited verbatim quotation** from an approved source (checked against the retrieved passage, as the policy guards already do);
- is **confirmed** in the Buff vocabulary block.
Otherwise the field is blanked (or the clause removed) with a manager-visible note: "No Buff City Soap guidance on file for <topic>; please complete this yourself." Each hit is logged as a structured, redacted event (`forms.grounding.legacy_assertion`: template key, field key, concept, action — never the text).

## 7. Modes and rollout (safe by construction)
| Stage | `FORMS_GROUNDING_MODE` | Behaviour | Gate to advance |
|---|---|---|---|
| 0 | `off` | Today's prompts, byte-identical | — |
| 1 | `shadow` | Classify, assemble and guard **in memory**; the **model still receives today's prompt**; log what would be withheld/blanked (counts by concept, template, field; no text) | ≥ 2 weeks or ≥ N drafts per family; Buff reviews golden labels and the log summary |
| 2 | `enforce` for **coaching + corrective action + policy review + follow-up** | New prompt and guard live; kill switch back to `shadow` | No `legacy_only_group` failures; no false-positive blanking on a manager's own terms; spot-check of drafts by HR |
| 3 | `enforce` for **EPPs** | Same | Same, after the performance-plan terminology decisions |
Enforcement never runs on Preview; no migration, no knowledge write, at any stage.

## 8. Safeguards preserved or added
- **Unchanged:** role resolution by tag/title, ambiguity refusal, query-failure refusals, `incomplete_rule_groups`, the unavailable-framework block, brand-scoped JBA retrieval, policy-claim and narrative guards.
- **Added:** `legacy_only_group` — if classification would leave a required group with no methodology segment, fail closed with the same manager-facing unavailable message (never silently weaker).
- **Citations/provenance:** each grounding row carries `{documentId, title, locator, origin, classification}`; the draft's `sources` show a label (legacy ones read "Legacy methodology — not Buff policy"). Quotations are never reworded.
- **Provenance record (optional, later):** registry version, withheld segment ids and gaps shown, stored with the draft. Needs an additive event kind (a small migration), so it is **not** part of stage 1; shadow logs are enough to start.

## 9. Regression tests (written before enforcement)

**A. Safeguards unchanged** — `performance-management-role.test.ts`, `framework-readiness.test.ts`, brand-scope tests, policy-claim tests pass untouched; framework missing/ambiguous/incomplete still blocks governed drafts.

**B. Classifier**
1. Golden file: every Framework segment's label equals the reviewed label.
2. Concept tests: "Spa %", "Club Close %", "PPTA", "Routine Mat", "Bonus Viewer", "SDIT/TSD/ASD/FTTC", "Sun Tan City leader" ⇒ `legacy_specific`; "observe → expectation → follow-up", escalation and documentation principles ⇒ `methodology`; a sentence mixing both ⇒ `ambiguous` (withheld, listed).
3. Required groups: all 12 groups keep ≥ 1 methodology segment on the shipped chunks; a synthetic legacy-only group ⇒ `legacy_only_group`.

**C. Assembly** — withheld text absent; vocabulary, gaps and legacy notice present; row headers keep `[title — locator]`; methodology text byte-equal to source.

**D. Shadow equivalence** — with the flag on `shadow` the model receives a prompt **byte-identical** to `off`; the would-withhold log is produced and contains no document text.

**E. Output guard** — model output echoing "Spa %" or "SDIT" as policy ⇒ field blanked with note; the same terms typed by the manager ⇒ preserved; a verbatim JBA quotation containing "client" ⇒ preserved; a concept listed in the vocabulary ⇒ allowed.

**F. Per document family** (mocked model, real prompts/guards)
- **Coaching, Follow-Up Coaching:** drafts contain no legacy assertion; observation/expectation shape intact; framework groups present.
- **Corrective Action, Policy Review:** policy fields still come only from the brand-scoped manual with page/section; "Direct policy" quoting unchanged; escalation rule (6.4) group still present.
- **EPPs (SDIT, TSD, ASD-SDIT, FTTC, DMIT):** intake still asks for the figures the form requires; drafts never fill PPTA/LPSVA/UPTA/Club Close from the Framework (figures only "as provided"); no "No Buff City Soap guidance on file" note when the manager supplied the content.
- **Exit, Demotion, Position Transfer, hiring forms:** confirm they do not use the Framework (no behaviour change); exit draft rules (no claims that steps were done) unchanged.
- **General Q&A:** legacy chunks labelled/excluded per policy; other Buff documents unaffected.

**G. Provenance and citations** — `sources` carry origin and classification; policy citations keep page/section; no rewording of quotations.

**H. Data safety** — tests assert no insert/update/delete on `knowledge_documents` or `knowledge_chunks`; Ask Sunny fixtures unchanged; Woven tables not touched.

**I. Full suites** — EPP, coaching, corrective-action, exit and hiring conversation suites pass unchanged in `shadow` and, once enabled, in `enforce`.

## 10. Implementation order (after approval)
1. Registry + classifier + golden file + tests (no behaviour change).
2. Vocabulary/gaps config + assembly + shadow logging (flag `off` by default, `shadow` on production).
3. Review: Buff approves labels, vocabulary and gaps.
4. Output guard (shadow first).
5. Enforce per family; EPPs last.
6. Later: Buff-approved framework as a **new version of the tagged document**; flip its registry origin to `buff_official`; retire the classifier path for it.

## 11. Decisions for you
1. Approve building steps 1–2 in shadow mode (no behaviour change).
2. **Withhold** legacy segments from the prompt (recommended) vs include them labelled.
3. Who reviews the golden labels for Buff, and the shadow-log threshold N.
4. Initial vocabulary block contents (guest, Core Values, 7G Service, District Manager/DMIT).
5. Whether the legacy document is excluded from general Q&A by default.
