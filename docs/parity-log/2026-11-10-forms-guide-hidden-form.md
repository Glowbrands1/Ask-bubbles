# Forms guide: a hidden form is not available (Bubbles-only)

First written 26 Oct 2026 for #194; rebuilt on main 10 Nov 2026 (October rebuild 8).

FORMS_GUIDE_ENABLED (#194, ported from the sibling app's #262). A question
about a form this deployment hides in `config/company/forms/hidden.ts`
("what is an epp" once the EPP keys are hidden) is answered "The EPP isn't a
form available in Ask Bubbles." instead of falling through to the knowledge
base. Stays Bubbles-only: the sibling app has no hidden-template list, so
every template it explains is one it offers. Test:
`src/lib/forms/forms-guide.test.ts` (holds with the EPP keys hidden and shown).
