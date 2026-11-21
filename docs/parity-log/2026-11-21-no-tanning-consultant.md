# 2026-11-21 — no "tanning consultant" in Ask Bubbles

**Stays Bubbles-only: Ask Sunny is untouched.** Pau, via QA2: "tanning consultant" is the sibling company's role only.
- The Tanning Consultant Interview Form is out of the hiring library seed, and its key (`tanning-consultant-interview`)
  is in `RETIRED_TEMPLATE_KEYS`: the row is switched off the next time the library is installed, never deleted (Pau
  handles the row itself).
- The FTTC / "full-time tanning consultant" job title is gone from `config/company/job-titles.ts` (FTTC existed only for
  that role); SDIT, TSD, ASD and DMIT stay for now.
- The tanning matcher and words are gone from `template-intent.ts`, `chooser.ts` and `epp-intake.ts`.
- A test checks that no form a manager can see or create, no job title, no chooser option and no prompt text contains
  "tanning".
- The two hidden management interview forms keep their own wording: hidden; tanning wording inside, revisit if Bubbles
  ever un-hides them.
- The brand-filter vocabulary in `config/company/knowledge.ts` keeps naming the sibling company: it exists to strip that
  company's sections from the shared policy manual.
- Known gap, already on main (old chat path; QA2 put it on the board for Monday, 21 Nov 2026): with a Coaching card
  open, asking for an interview form the library does not have ("create a store manager interview form for <name>")
  re-proposes the open Coaching card instead of saying there is no such form. The consultant interview used to avoid it
  only because its own matcher named it; it now behaves like any unknown interview.
