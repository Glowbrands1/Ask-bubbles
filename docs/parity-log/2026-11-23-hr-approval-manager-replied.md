# HR approval: "Manager replied to changes", Approve or Send back after the reply, the red Pending button, Print, "Sunny approvals ↗" (owner, 23 Nov 2026)

**Ask (the owner, via QA):** "when manager replies in note, there should be approve button here please and notify
manager … then the manager once sent back, will have option to print and save as PDF" … "of course the notes should
not show in PDF"; "colene sent to marissa, marissa replied and it shows … 'sent back for changes' still. it should be
Manager Replied to changes. then view then approve"; "its so small pending approval, make it red button and animated
shaking if theres a pending".

**Change (Ask Bubbles), the same design as Ask Sunny #1288 (QA asked the two to match):**
- `approvableFromSentBack` (`hr-approval-rules.ts`): a sent-back form whose creator or a sender wrote a note after HR's
  latest send-back. `decideHrApproval` lets HR approve it (the same finalize path) or send it back again with a note;
  reject still needs `pending`.
- HR's list: `managerReplied` rows read "Manager replied to changes"; "Needs your decision (N)" and "Waiting on the
  manager"; the count is `needsHrDecision`, the same N as the "Pending HR approval (N)" button, which is red and shakes
  every 4 s when N > 0 (none under prefers-reduced-motion).
- Print beside Download PDF (`printFormPdf`); the PDF holds no approval notes (real-route test).
- `read_hr_approvals`: HR's "waiting for you" includes replied forms; managers read "Approved by HR".
- Bubbles only so far: `edit_form` on a form waiting for HR is refused with `held_for_hr` and the reason, instead of
  each field's bare "not_draft"; and the "Sunny approvals ↗" tab (app-switcher users) to the sibling's Pending HR
  approval view.

**Ask Sunny:** built in parallel in #1288 (the shared parts). Still to port there after merge (QA: Sunny coder 2): the
`held_for_hr` refusal in the agent loop's `edit_form` (with the two replay cases), and Send back from the replied stage
if #1288 has not added it. The mirror "Bubbles approvals ↗" tab is Sunny coder 1's (QA).
