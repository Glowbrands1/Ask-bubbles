# Phase 2 implementation plan — preliminary decisions

**Status: plan only.** These are planning directions, not approval to modify or publish templates. No template, knowledge document, Woven record or filed form has been touched. Evidence and wording: `docs/buff-form-content-approval-table.md`; sources: `docs/buff-city-soap-form-content-audit.md`.

Baseline: `main` at `0007720` (PR #47 merged). Production sync for #47 **has not been run** (your separate authorization). Production still holds version 2 of the Store release for 11 templates; the five guest-terminology revisions are waiting in code.

## 1. What is in scope now

| Decision | Direction | Result for templates |
|---|---|---|
| **D1** | Keep existing coaching topics | **No change.** `coaching` stays at revision 2, version 1; its 10 filed forms are unaffected |
| **D3** | Use verified 7G Service terminology | `sdit-epp`: "Follow through with Client Engagement Strategies with every client." → "Follow through with 7G Service with every guest." |
| **D4** | Correct the EPP acknowledgement | "…discussed this training document and I will participate in the plan for improvement." → "…discussed this Employee Performance Plan and I will participate in the plan for improvement." in all six EPP templates |
| **D12** | Generic job-title placeholder in the demotion example | `demotion`: "…to a PT Tanning Consultant at $x.xx /hr…" → "…to a PT (New Job Title) at $x.xx /hr…" |
| **D14** | Remove the tanning product-use hiring question | `prescreen-phone-interview`: remove "Are you willing to use our services as part of your Sun Tan City uniform? (Must agree to UV, Sunless and Spa usage to proceed with employment)" and "uniform agreement" from the description |
| **D18** | Verified Makery cleaning scenario | `management-interview-round-1`: "…like cleaning beds and doing laundry…" → "…like cleaning the Makery and equipment and keeping the workspace organized…" |

**Held (unchanged):** D2, D5–D11, D13, D15–D17, D19, D20; the 29 unsupported replacements; any HR policy, KPI, compensation rule or job-title mapping.

> Wording note: D3 and D18 use the proposals in the approval table. D3 keeps the existing option key (`client_engagement`); only the label changes. If you prefer different wording for any item, tell me before implementation.

## 2. Exact edits and where they live (read from `main`)

| Item | File and location | Templates re-issued | Revisions |
|---|---|---|---|
| D3 | `src/lib/forms/library.ts` — `SDIT_EPP_EXPECTATIONS` option `client_engagement` (label at ~line 834); appears in the expectations list and its re-statement for the employee | `sdit-epp` | 5 → 6 |
| D4 | `library.ts` — SDIT acknowledgement (line ~788), ASD-SDIT (~1037), FTTC (~1057), DMIT shared document (~1623 and ~1636), TSD constant `TSD_ACKNOWLEDGEMENT` (~1234; printed twice: agreement and re-evaluation) | `sdit-epp`, `tsd-epp`, `asd-sdit-epp`, `fttc-epp`, `dmit-epp-tsd`, `dmit-epp-dmit` | sdit 6 (with D3), tsd 4 → 5, asd 2 → 3, fttc 2 → 3, dmit-tsd 2 → 3, dmit-dmit 2 → 3 |
| D12 | `src/lib/forms/employment-change-library.ts` line ~129 | `demotion` | 1 → 2 |
| D14 | `src/lib/forms/hiring-library.ts` — field `uniform_services` (~lines 599–600) and the description at ~645 | `prescreen-phone-interview` | 2 → 3 |
| D18 | `hiring-library.ts` line ~203 | `management-interview-round-1` | 3 → 4 |

Coaching, Policy Review and their acknowledgements ("discussed this training and plan for improvement") are **not** touched (CO-5 preserve). Template keys, permissions, field and option keys, and variants stay unchanged except that D14 **removes** the `uniform_services` field from the new version only.

## 3. Dependencies found (so nothing is missed)

| Area | Finding | Handling |
|---|---|---|
| AI prompt example | `form-proposal.ts` (~line 1854): "Jane Doe, Store Director FT at $18/hr → Tanning Consultant PT at $12/hr…" and related comments in `employment-change.ts` | The example is conversation text, not the form. Propose a neutral example ("… → Team Member PT at $12/hr …") **only if you approve it**; otherwise leave. It does not change any form |
| Tests that pin the old wording | `hiring-library.test.ts`, `employment-change.test.ts`, `employment-change-conversation.test.ts`, `employment-change-draft-route.test.ts`, `guest-terminology.test.ts` (pins the unapproved `Client Engagement Strategies` line as unchanged — must be updated when D3 is approved) | Update with each PR |
| Parity test and fixtures | `template-parity.test.ts`, `approved-template-changes.json` (index-based), the QA PDF comparison against Ask Sunny's rendered text | Text substitutions (D3, D4, D12, D18) need new allow-listed entries. **D14 removes a block**, which shifts every later block index; the parity test needs an explicit *approved removal* category that compares by block key, and the PDF comparison needs the removed question's text (and its page/layout effect) allow-listed. This is test-infrastructure work, which is why D14 is a separate PR |
| Prescreen filed forms | None (0 instances) | No data impact |
| Woven / job titles | None changed | No effect |
| Ask Sunny | Fixtures read-only | Untouched |

## 4. Proposed pull requests

**PR 2A — text substitutions (D3, D4, D12, D18)** · small, low risk.
- New seed revisions as in section 2 (sdit 6, tsd 5, asd/fttc/dmit-tsd/dmit-dmit 3, demotion 2, round-1 4).
- Tests: new `phase2a-wording.test.ts` in the style of `guest-terminology.test.ts`: each (from → to) pair ships; replaced wording gone; **held and unapproved wording byte-identical**; only labels/text change (keys, option keys, variants, permissions pinned); exact revision map; PDFs print the new wording (and the old does not appear); upgrade path publishes exactly the affected templates and archives version 1 untouched; repeat syncs publish nothing; filed forms stay pinned; admin-authored versions held back; Preview writes nothing.
- Update the parity allow-list for the new substitutions.

**PR 2B — D14 field removal.** · isolated because of test infrastructure.
- Remove `uniform_services` and "uniform agreement" from the description; revision 2 → 3.
- Parity/QA changes: an *approved removals* list keyed by block; PDF comparison allows the removed question and checks the remaining questions keep their order and numbering.
- Tests: the field is absent from the new version and present in archived version 1; the prescreen still has its other questions in order; PDF page count/text; upgrade path; repeat sync; Preview blocked; no filed form affected.

D1 needs no PR.

## 5. Rollout, per PR
1. Branch from `main`; implement; run typecheck, lint, the full unit suite and Playwright on the **merge result** (as done for #47).
2. Open the PR; you review; merge only on your approval.
3. Confirm the production deployment reaches READY on the merge commit.
4. **Do not run the template sync until you authorize it.** When authorized, an admin opens Forms → Form Templates (or POSTs); the page now shows the sync result.
5. Read-only verification: new versions published and current, old versions archived, fingerprints of untouched templates and filed forms unchanged, no held-back or failed templates, no relevant runtime errors.

Because #47's revisions have not been synced yet, a single sync after PR 2A would publish the guest wording and the Phase 2A wording **together** (one new version per template, not two). Tell me if you would rather sync #47 on its own first.

## 6. Risks and how they are contained
- **Wording changes the form's meaning:** each replacement quotes a Buff document (MRM, 7G Service) or is a pure label correction; held items are pinned unchanged by tests.
- **Removal of a question (D14):** visible in the PDF; version 1 stays archived and readable; no filed prescreen forms exist.
- **Test fixtures drift:** the Ask Sunny snapshot is never edited; the allow-list is explicit and reviewed.
- **Sync failures:** per-template reporting, recoverable retries, Preview blocked (PR #45).
