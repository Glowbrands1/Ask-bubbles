# Failure 2, items 1, 4 and 7: port from Ask Sunny #1297 (1dd1bee, 917bfd67)

**Report (Pau's review of a live Ask Sunny chat, via QA, 23 Nov 2026; "OK BOTH": fix Ask Bubbles too):** an area manager
pasted HR's edit request for an employee's exit form ("… gave verbal notice of her immediate resignation …"), was told no
exit form was on file, and the exit card made next was dated the last day worked.

**Ported (Ask Bubbles, same names as Sunny's #1297):**
- **Item 1, `find_past_forms`:** a warning level is read only from the manager's own words of this request (their
  message and the quote of it, never the model's `form` or `about`); it narrows only when the request is about
  Corrective Actions (`aboutCorrective`: here, when every form left after the kind narrowing is one; Sunny reads the
  model's form wording or the card on screen), and only ever chooses among Corrective Actions.
- **Item 4, `edit_form`:** an empty value is a field to clear (the writers' clear list). A field whose new text (8+
  characters) is quoted from THIS message, or whose clear is asked in this message's words naming the field by its own
  label (`clear_evidence`, `quoteNamesField`), is saved as the manager's own edit (`statedFieldsWrite` in
  `form-write.ts`, `saveInstanceValues` via chat), drafts only; the result lists each (`stated_edits`,
  `stated_edits_note`) and the reply names each. Name, level, payroll, form_date, follow_up_date and action_plan keep
  their own rules. `clear_evidence` is passed through the revision path (`openEditableDraft` → `editForm`).
- **Item 7, `propose_form`:** on an exit form, a date the manager gives to one of the form's own date lines (last day
  worked, notice given, notice fulfilled; `readExitFacts`) is never the form's date.

**Not ported:** #1297's Corrective Action same-date guard (`form_on_file_same_date`): Ask Bubbles has its own
(`same_incident_on_file`, #1123), and QA asked Sunny to rename theirs to match. #1297's exit-on-file guard (15ac2c7) was
not in this assignment.

Cases: `nov23-agent-loop-failure-2-level-and-exit-date-cases.ts` (items 1, 4 and 7 fail on main and pass here; the
U16 level control passes on both).
