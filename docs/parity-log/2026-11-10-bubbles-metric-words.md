## 10 Nov 2026: this company's metric words, and no "Club Close" in app strings — not needed in the sibling app

QA (10 Nov 2026, from coding 4's reading of this app's production env): the
metric readers came over from the sibling app with that company's own metrics
("club close", upgrades, EFTs, membership %). Under BUBBLES_METRIC_WORDS_ENABLED
(default off) this app drops those and reads its own: UPT, units per
transaction, average sale, transactions (`forms/metric-shortfall.ts`, the
target reading in `forms/ca-policy.ts`). The brand scan
(`security/no-other-brand-strings.test.ts`) now bans "club close" in strings
the app writes. The EPP template and intake (`forms/library.ts`,
`forms/epp-intake.ts`) are allowlisted pending Pau's BCS EPP metrics.

The sibling app's words are its own company's metrics, so nothing changes
there. Rewriting this app's tests and replay cases into its own metrics is
queued at low priority.
