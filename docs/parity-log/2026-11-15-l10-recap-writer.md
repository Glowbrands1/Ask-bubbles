## 15 Nov 2026: DM L10 End meeting saves notes, to-do counts and solved issues' owners (port of Ask Sunny #1032)

Port of Ask Sunny #1032 (`ae88f7a`), the pair of Leadership Hub #81 (`aac8600`) and its migration
`20261205120000_l10_recap_notes` (applied to production by QA). End meeting now sends each solved issue as
`{ title, owner }` when it has an owner, the meeting's shared notes (`doc.meetingNotes`) and the to-do counts;
`endMeetingAction` checks them before anything reaches the Hub. The auto-save recap keeps plain titles, as the
database's own auto-save does. The readers came first (#936). The recaps and Past meetings pages show the notes and,
in Ask Bubbles at QA's request, "To-dos completed" as a percent.

Also: the meeting-view tests that follow a debounced save now wait for it instead of relying only on a 20 ms sleep
(one failed once under a loaded parallel run). Expectations unchanged.

Sibling app: already in Ask Sunny (#1032). Ask Sunny computes "To-dos completed" but does not show it yet, and its
meeting-view tests have the same fixed sleeps; both reported to QA.
