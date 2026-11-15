## 15 Nov 2026: the DM L10 tab — the Leadership Hub's BCS DM L10, inside Ask Bubbles (port from Ask Sunny)

Port of Ask Sunny's DM L10 tab (Ask Sunny `main` `e01da17`, `src/features/l10`; its entry is Ask Sunny's
`docs/parity-log/2026-11-13-dm-l10-tab-leadership-hub.md`). Ask Bubbles gets a "DM L10" tab (sidebar, "Meetings")
that opens the Leadership Hub's **BCS DM L10** (`bcs-dm`) with the Hub's own page, on the Hub's own meeting record:
Ask Bubbles holds no copy. Its server calls the Hub's partner API (`POST /api/partner/l10`, partner `ask-bubbles`,
HMAC-signed with `HUB_PARTNER_SECRET`); the Hub's database acts as the Hub account with the signed-in person's email,
checks that account's meeting role and refuses every meeting not on its allowlist for `ask-bubbles` (only `bcs-dm`,
Glowbrands1/leadership-hub#78). Everything in Ask Sunny's tab as it stands on its `main`: note cards, chat history,
@-mentions, Open as document, web search / fetch, attachments, restore (Hub admins), recaps, issue files, Past
meetings, IDS tabs without ranking, adder initials, "Add new rock" at the top.

Owner decisions (via QA, 15 Nov 2026): the tab is labelled "DM L10"; BCS DM L10 only for now (the BCS GM L10 would be
one tab label plus a Hub allowlist row); the BCS DM L10 has no Reference (Business Plan / Accountability Chart), in
both this app (`NO_REFERENCE`) and the Hub (its roster sends `reference: false`).

Mechanism ported, not content: none of the STC DM L10's own agenda, segue name or wording is copied, and no people are
in this repository (the Hub serves the roster per request). Differences from Ask Sunny's copy are listed in
`src/features/l10/PARITY.md` ("Ask Sunny vs Ask Bubbles").

Also added, as in Ask Sunny: the CI `build` job (`next build`), now part of the required `checks`.

Not touched: chat, forms, Corrective Action, policy citation, knowledge sync and Woven. Access/auth is touched only to
READ the verified identity (`pageIdentity`), unchanged. Spend tracking gains the `l10_assistant` source; the
assistant runs `modelSpendGuard` before the Hub and the model, as chat does.

Sibling app: not needed. This is the port of Ask Sunny's own feature; nothing in Ask Sunny changes.
