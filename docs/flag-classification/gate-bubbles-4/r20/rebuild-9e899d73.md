# Re-land trees rebuilt on main 9e899d73 (v2-Gate-Bubbles-4, 14 Nov 2026)

QA 03:14Z: the hold is lifted (the card check is live in both apps; Bubbles 17y passed live at 03:03Z). Gate the re-land list one at a time on 9e899d73; #830 goes last and needs QA's call.

Method: the resolved b9720947 tree of each PR (`git diff --cached b9720947` in /home/user/gate/t<n>, in patches/) applied with `git apply -3 --index` on 9e899d73 in /home/user/gate/r<n>.
- Clean: 849 848 847 724 756 739 504 779 772 774 750 830.
- chat-quality-flags.ts only: 678 684 843 757. Both sides kept with union.py. In 843 and 757 the conflict was inside the flag-name list, where union.py adds a stray `}` / `/**`; I removed it by hand.
- No conflict markers left; tsc 0 on all 16.
- production flags on 9e899d73: 413 (on + assumedOn). New since 35b062c1: ACCOUNT_CHANGE_REDERIVES_POLICY, ACCOUNT_REPLACED_CLOSE_SENTENCE_KEPT, POLICY_NOT_FOUND_PLAIN_WORDING.

Order: 849, 848, 847, 678, 684, 724, 756, 843, 739, 504, 779, 772, 774, 750, 757, then 830. #849 waits for QA on marking nov12-17q-7 fixed by CARD_CHECKED_AGAINST_WORDS, so #848 goes first.

| PR | branch | commit on 9e899d73 |
|---|---|---|
| 848 | claude/reland-848 | 406040f9 |
