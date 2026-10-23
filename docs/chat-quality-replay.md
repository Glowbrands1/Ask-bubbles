# Chat-quality replay cases

These cases are the low-rated chats, written so a regression test can run them
without a live model. The employee in every case is **Marissa Lempka**. Vary
the wording: lowercase, a one-letter typo (`marisa lempka`), and more than one
date shape (`10/1/2026`, `on 10-1`).

Add a case in `src/lib/ai/chat-quality-replay.test.ts`. Use the manager's
words. Assert the field they already gave, the policy citation, or the draft
field that must survive. Do not add a list of blocked names. A span is an
employee only when the roster supports it. A span that names the pinned
manual, or one of its headings, is the policy source.

## What a citation says

The policy source is the **JBA Policy Manual**. A citation names the policy
and the page the chunk carries:

`Standards of Conduct Policy, JBA Policy Manual p.12`

The section is the one the same Corrective Action readers return from the
chunks in hand. An employee who is tardy cites Attendance. A store that
opens late cites Late Opening. Phone use cites Cell Phone/Smart Watch.
Nothing here prefers one heading because it overlaps the sentence more.

`JBA Manual` is a short name for that source. It is never an employee.

## Cases

1. A corrective action for a Standards of Conduct violation keeps Marissa
   Lempka, does not ask for her name again, and does not refuse the draft
   because no prior coaching is on file. The citation is Standards of Conduct
   from the manual fixture, with its page.
2. `show draft with edits` merges into the draft. Offense and the Action Plan
   stay filled when the edit does not replace them.
3. `NE`, `Testy Testerson`, and `JBA Manual` are not offered as the employee
   when Marissa Lempka is the roster person already named. `JBA Manual` matches
   the manual's title.
4. When the two-sentence check is on, the action plan is the review sentence
   and the required closing. The existing builder is unchanged when the check
   is off, including its payroll sentence.

Flags default off. See `src/lib/config/chat-quality-flags.ts`.
