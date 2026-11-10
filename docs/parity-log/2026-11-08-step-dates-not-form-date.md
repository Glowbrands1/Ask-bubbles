# This app only: every date a step's, the card is not dated by a coaching (STEP_DATES_NOT_FORM_DATE_ENABLED)

QA round 5 (Bubbles live, 7 Nov 2026 18:56Z): "hi, i need a performance corrective action for <name>, a team member. she is under performance for september. she already received a verbal warning and coaching on 9/8/2026, 9/15/2026 and 9/25/2026. no payroll deduction applies. today's date is fine." dated the card 2026-09-15.

Here `ai/form-proposal.ts` first dates a Corrective Action card with `extractFormDate` (9/15), then `forms/incident-dates.ts` decideFormDate replaces it only with two or more incident dates. With STEP_DATE_NOT_INCIDENT on (production), all three dates are the steps', and only "today" was left, so the card kept 9/15. With the flag on, once step dates were set aside, the one incident date left, or the day the form is created, dates it. Same flag name, default off.

Not needed in the sibling app: the same request there, through its replay pack with its production flags, dates the card today (11/7/2026). Its Corrective Action card is dated by `correctedFormDate ?? extractFormDate` and the slot line, not this path. Checked 8 Nov 2026 on its main.

The other half of the same report, Prior actions keeping only "Coaching — 09/08/2026", is in both apps and is fixed separately.
