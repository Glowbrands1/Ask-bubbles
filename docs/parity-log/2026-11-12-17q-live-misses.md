# 17q live misses — Bubbles-only (12 Nov 2026, coding 5)

QA's Bubbles 17q live test, two low-priority misses, both behind default-off flags here:

- **POLICY_DASH_LINE_PAGE_ENABLED** ("she rang up the wrong items on 11/9": the
  Standards of Conduct Policy line had no page). **Not needed in Ask Sunny.**
  Sunny has no POLICY_PAGE_ON_CARD mechanism: no Policy line on its card carries
  a page, Attendance included. On Sunny `main` (0bbf0c901) the same request's card
  gives the page on its own citation line instead ("Standards of Conduct
  Policy, JBA Policy Manual p.12"), checked with the same wording in Sunny's
  replay pack. The gap rides on POLICY_PAGE_ON_CARD, if that is ever ported.
- **Item 7** ("she also left the register unlocked" reached the saved Observation,
  not the card's What happened): fixed in production by CARD_CHECKED_AGAINST_WORDS
  (bce91f8, live in both apps). This PR's ADDED_ACCOUNT_ON_CARD flag was dropped
  (QA, 14 Nov 2026): on top of that fix it added the fact a second time. The two
  replay cases stay as guards, one of them against the doubled fact.
