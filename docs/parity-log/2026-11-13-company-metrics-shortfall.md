# Company KPIs as a stated sales shortfall — Bubbles-only (13 Nov 2026, coding 5)

COMPANY_METRICS_SHORTFALL_ENABLED (default off; QA's ruling (a) on CA_NO_POLICY_ASKS_WHICH): "She was below goal in
IPT, AOV and Comp Sales % for October" made a CA card with no Policy line, because Buff City Soap's KPIs
(`config/company/metric-words.ts`) were not among the shortfall reader's metric names. **Not needed in Ask Sunny:** it
has no company metric list, and its own sales metrics (club close, conversion, upgrades, EFTs, SPH, ATV, red %) are
already in the shared `METRIC_NAMED` list of `forms/metric-shortfall.ts`, so a stated Sunny shortfall already reads as
the Standards of Conduct under CA_SALES_POLICY.
