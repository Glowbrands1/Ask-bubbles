# Not needed here: "$20 payroll deduct applies" is the amount (the sibling app's AMOUNT_BEFORE_PAYROLL_DEDUCT_ENABLED)

The sibling app's flip-9 live tester (QA, 8 Nov 2026): "… $20 payroll deduct applies" read payroll deduct Yes and
then asked "**Payroll deduction amount**?". Its fix (AMOUNT_BEFORE_PAYROLL_DEDUCT_ENABLED) reads a figure right before
"payroll deduct(ion)" as the amount.

Not needed in this app: checked on main 8 Nov 2026 with production's flags plus flips 6 and 8, the same wording gives
"**Payroll deduction amount:** $20" and no amount question. A guard case is in the replay pack
(`nov8-sunny-round4-guards-cases.ts`).
