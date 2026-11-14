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
| 849 | claude/reland-849 | 1563370e (nov12-17q-7-also-left-register-unlocked-on-card marked fixed by CARD_CHECKED_AGAINST_WORDS, QA 03:15Z) |
| 678 | claude/reland-678 | 5f5bb4aa |
| 724 | claude/reland-724 | f429113e |
| 843 | claude/reland-843 | cf330464 |
| 504 | claude/reland-504 | 39f1d7f7 |
| 772 | claude/reland-772 | 906878f4 |
| 750 | claude/reland-750 | b925a483 |

QA 03:15Z split the list: Gate-Bubbles-4 gates the odd positions (849, 847, 684, 756, 739, 779, 774, 757); the even ones (848, 678, 724, 843, 504, 772, 750) go to Gate-Bubbles-2. #830 is last and waits for QA's call.
I stopped the #848 run I had started at 03:20Z, before its first checkpoint.
#849 replay cases on 9e899d73 with production flags: 5 pass, 1 expected fail (nov12-17q-1, POLICY_DASH_LINE_PAGE still open).
