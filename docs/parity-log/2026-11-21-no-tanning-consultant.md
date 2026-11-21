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
