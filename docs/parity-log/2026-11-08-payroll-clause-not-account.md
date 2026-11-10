# Not needed here: the payroll answer in the Observation (the sibling app's PAYROLL_CLAUSE_NOT_ACCOUNT_ENABLED)

The sibling app's round-5 live tester (QA, 8 Nov 2026), item 2a: "… she was late today, $20 payroll deduct applies"
read the $20, but the Observation of Offense kept the raw "$20 payroll deduct applies" and the app's own state line
after it ("… applies Payroll deduction amount: $20."). Its fix (PAYROLL_CLAUSE_NOT_ACCOUNT_ENABLED, default off) drops a
bare payroll answer clause and that state line from the account.

Not needed in this app: checked on main e7a7ba9 on 8 Nov 2026 with production's flags, through the replay route (the
person invented). "create a verbal ca for <A> she was late today, $20 payroll deduct applies" gives "**Payroll
deduction amount:** $20" and no amount question, and the card shows no Issue built from the payroll clause: neither the
raw "$20 payroll deduct applies" nor a "Payroll deduction amount: $20." line reaches the account here.
