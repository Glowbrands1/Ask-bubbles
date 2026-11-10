# Bubbles only: "another corrective action from <A>" names <A> (REQUEST_FROM_NAMES_EMPLOYEE_ENABLED)

QA, 8 Nov 2026. With the managers' Woven wordings, "Please create another corrective action from <A>. This would be a verbal due to not completing her woven courses by the deadline" ("from" typed for "for") gave "Who is this form for?" here. A name in any case is read only straight after "<form> for" (`forms/proposal.ts`, protected).

The flag reads "<form> from <name>" as "<form> for <name>" in `forms/template-intent.ts` canonicalShorthand. It never does so before a word that cannot start a name ("from the …", "from my …", "from last week").

The sibling app is not changed: its production read <A> right (QA, 8 Nov 2026), and its replay of the same wording names her. There, INTENT_EXTRACTION_ENABLED is on and its intent reading gives the employee. Port the same rewrite if the sibling app ever asks who on this wording.
