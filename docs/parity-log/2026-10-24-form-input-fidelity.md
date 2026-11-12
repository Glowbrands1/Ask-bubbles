## 24 Oct 2026: typed dates and one-word follow-ups

`FORM_INPUT_FIDELITY_ENABLED` is Bubbles-only in this change. A matching
Ask Sunny fix is being built separately (its twin is Ask Sunny #166), so this
one is not ported here. No store or salon wording was copied. The JBA Policy
Manual titles stay.

Off, a manager who types "yesterday" still gets a draft dated today, and a
one-word "verbal" or "written" can still be saved as Job Title. On, the
typed or resolved day is the form date, and today is used only when no date
was given. A bare follow-up goes to the question just asked.

Rebuilt on main on 11 Nov 2026 (QA's stale-PR cleanup of #92). On main with
production's flags the typed dates and a bare "verbal" / "written" / "yes"
are already read correctly; a bare "yesterday" after the position question
was still saved as Job Title "Yesterday" (replay case
`nov11-form-input-fidelity-title-yesterday`).

12 Nov 2026 (QA's #760 gate): Coaching drafts get the form date only while
`UNREAD_DAY_NOT_INCIDENT_DATE_ENABLED` is also on, so "late last week" is
never saved as today's incident. Not ported: Ask Sunny's `main` has no
`draftDateApplies` or Coaching form-date path, and Ask Sunny #166 is still
unmerged. Whoever lands #166 carries this same both-flags condition.
