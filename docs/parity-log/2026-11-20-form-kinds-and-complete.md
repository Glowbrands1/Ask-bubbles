# 2026-11-20 — form kinds stay apart; a cut-off list is never called complete (port from Ask Sunny #1133)

**Sibling app: ported from Ask Sunny #1133 (main `47605e1a`).**

- `forms/chat-form-records.ts` (the shared reader: the regular chat's FORMS ON FILE block and the Leadership
  Assistant's forms tool): a FormKind may carry `excludeTemplateNameWords`; the Coaching kind excludes "follow", and
  `ofKind` drops those rows after the read, because the read matches template-name words as part of the name
  (`ilike`), so "coaching" also read the Follow-Up Coaching Form.
- Sunny's "complete" half lives in its agent loop's period list (Bubbles has no loop). Here the same rule is applied
  where this app says a list is complete, `narrowedSentence`: a list is every such form only when the database
  returned fewer rows than it was asked for (`cutOff`), never counted after the visibility and kind filters. The named
  read stops at 50 (not the 100 it used to be measured against), so a full named read is never called complete either.
- Agent-loop parts (find_past_forms' /coach/ narrowing): not ported, no loop here.
