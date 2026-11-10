# This app only: the "131 tans verbal" replay case is dropped (nov6-sales-shortfall-object-count-h18)

**Why.** The case was the sibling app's tester batch 2 (H18, "<name> 131 tans verbal"), paraphrased into this app. "Tans" is a Sun Tan City metric (tanning sessions). It stayed open here waiting for a glossary line for "Tans" (`ai/glossary.ts`, protected). QA (10 Nov 2026): a Buff City Soap case must not use a Sun Tan City metric; use this app's own metric of the same shape if one exists, otherwise drop the case.

**Checked.** This app has no counted metric of that shape: the glossary has only MSB, and the report catalog (`config/company/reports.ts`) is deliberately empty ("KPI definitions have not been supplied"). So the case is dropped. The other sales-shortfall cases (requirements, performance H01/H13, the floor negative) stay.

**The sibling app** keeps its H18 case; it holds there.
