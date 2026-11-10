## 6 Nov 2026: the street explanation under FORM_NAME_FROM_ROSTER — not needed here

The sibling app's flip-3 gate (defect 2) found that "coaching form for 123 Main
Street" lost ADDRESS_NOT_PERSON's "reads as a street address, not a person"
under FORM_NAME_FROM_ROSTER, because the name check cleared the card first.
This app has no ADDRESS_NOT_PERSON (see 2026-11-03-address-not-person.md); it
asks who the form is for, and nov3-street-address-coaching holds. The same
gate's defect 3 (the Observation's "Under Performance on PPTA") is ported in
the same pull request.
