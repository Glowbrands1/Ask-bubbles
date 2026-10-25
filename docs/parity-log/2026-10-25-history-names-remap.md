## 25 Oct 2026 — QA full chat history (port from Ask Sunny), remap pieces

Ported the name, title, payroll and other-chat fixes from Ask Sunny's
history-names commit. Two pieces live on this app's remap path only, because
Ask Sunny's forms do not run through it: the prior-step parts of a turn
("Prior coaching: September Promo coaching 9/29/26, product coaching form
9/30/26") name no form and no longer make "create a CA" ask which form to
start with (B14 conv_mvntwwn22a8fgi0), and a Corrective Action asked for on a
metric alone ("low sales per hour this month", B14 conv_mvntxr592mc1e2l) is
handed to the form proposal, which answers it — the rule Ask Sunny's intent
path already keeps (CA_TEMPLATE_MAP_ENABLED). Ask Sunny's report-routing
vocabulary fix stays Sunny-only (no report families here).
Tests: `src/lib/ai/history-names-oct25.test.ts`, `cross-chat-history-oct25.test.ts`.
Rebuilt on main on 11 Nov 2026 (QA's stale-PR cleanup of #140); replay case
`nov11-payroll-deductible-word-yes` (PAYROLL_DEDUCTIBLE_WORD_ENABLED).
