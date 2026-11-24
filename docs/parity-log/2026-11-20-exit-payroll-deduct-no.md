# 2026-11-20 — exit form: "payroll deduct no apply" is No

**Ported from Ask Sunny (65ff6beb, #1139).** `exit-details.ts` read "payroll deduct no apply" and "payroll deduct no"
as Yes on the exit form's "Is Payroll Deduction applicable?". "no apply" / "no applicable" and "payroll deduct: no" /
"payroll deduct no" now answer No, as "not apply" did. Only the reader is ported: Sunny's #1139 also changed its agent
loop's exit card and a draft guard for exit lines the loop writes, which this app does not have (no agent loop).
