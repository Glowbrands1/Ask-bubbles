## 11 Nov 2026: "payroll is deductable" is the manager's Yes (PAYROLL_DEDUCTIBLE_WORD_ENABLED)

Ported from the sibling app's QA history (its conv_mvh9a9q62mjffk2; first
ported here in #140 on 25 Oct 2026). Default off, same flag name in both apps.
Rebuilt on main on 11 Nov 2026 with only the payroll reading: QA ruled that no
change may extend a flag already live in production, so #140's extensions of
NOT_A_NAME_GUARD, FORM_CHOICE_STATED, CA_TEMPLATE_MAP, TITLE_WHOLE_WORD,
CROSS_CHAT_REPLY_GUARD and PRIOR_ACTIONS_PARSE were left out. Tests:
`src/lib/forms/payroll-deductible-word.test.ts`, replay case
`nov11-payroll-deductible-word-yes`.
