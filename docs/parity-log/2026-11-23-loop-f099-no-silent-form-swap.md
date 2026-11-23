# f099 on the loop: a form the library does not have is never swapped silently (23 Nov 2026, QA's live check of #1095)

**Sibling app: needs checking, not ported in this pull request.** Ask Sunny's loop has the same propose_form and
`quoteNamesForm`. This session has read-only access to the sibling repository, so QA routes the check and the port
(mechanism only; the sibling's own form names decide).

QA, live on the loop: "create a store manager interview form for Marnie Holloway" got "Here's the Prescreen / Phone
Interview Form for **Marnie**."; with a Coaching card open, "Who is this Prescreen / Phone Interview Form for?". The model
picked the nearest form and said nothing.

propose_form now takes form_asked_evidence (this turn's words naming the form asked for). Code checks the quote against the
chosen form's own names (`quoteNamesForm`: name, short name, initials). If another library form answers to it, the result
is form_asked_is_another, naming that form. If no form does, the result is form_not_in_library, with an ask_exactly that
says there's no such form (the quote's own words, trimmed to the form's name: `formAskedName`) and lists the forms; no card.
The model may offer a form in its place only with instead_of_asked true, and the card then carries
instead_of_asked.say_exactly ("There's no … in the forms library, so this is the … instead."). The rules book has the line.
No phrase list: the check reads only the template names.

Replay: `nov23-agent-loop-f099-form-not-in-library-cases.ts` (stand-in proposing the Prescreen form as the live model did;
written to hold before and after the management interviews are unhidden: either the reply says there's no such form, or the
card is the form named).
