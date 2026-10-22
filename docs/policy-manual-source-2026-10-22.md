# Corrective Action policy source — verification record (22 Oct 2026)

The same source-verification principles applied to Ask Sunny (owner decision, 22 Oct 2026), applied here.
Read-only `SELECT`s against the Ask Bubbles project (`dyurgwieyltnhphihwwj`); nothing was written.

## The document Ask Bubbles resolves

| | |
|---|---|
| Document id | `81622d77-ee6c-55f6-904d-dee057907a13` |
| Title | 2025 JBA Policy Manual - Edited 5-2025 |
| File | `2025-JBA-Policy-Manual-Edited-5-2025.pdf` |
| Knowledge scope | `bcs-core` (Buff City Soap) — the only indexed JBA document in the scope |
| Source | Woven handbook, entity `42486200-20b0-415c-9bad-c4425bc096ce`, last synced 8 Oct 2026 |
| How it is found | By name (title prefix); not tagged `official-policy-manual` |

## Approval status: **established**

Woven records whose title names JBA are held (`WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW`) and never ingested
until an owner confirms them by id in a reviewed code change. Entity `42486200…` was confirmed for
Buff City Soap by the owner on 8 Oct 2026 (`src/config/company/woven.ts`). The policy record
"JBA Policy Manual 2025" (`cc6c2bf3…`) stays excluded (`publication_unverified`).

## What the code now does (this branch)

* The manual lookup reports `ownerConfirmed`: true when the document is tagged `official-policy-manual`
  or is a Woven record (which reaches the Knowledge Base only through the owner-confirmation gate above).
* A manual found only by its name from an upload is marked on the draft and the chat card as
  *requires owner confirmation as Ask Bubbles' approved policy manual*. In production today the resolved
  manual is the confirmed Woven handbook, so nothing is marked.
* Policy language is retrieved from the manual's chunks and cited with section and printed page; no
  no-call/no-show finding is written without the manager stating it.
