# Gate-Bubbles position (resumed 21:53Z; was paused (QA, 10 Nov 2026 ~20:48Z; resume 05:55 PHT)

Session: session_01VVEkRRzGew9sHHGbAhxGaQ. Reports to QA session_01VVEkRTbAAAt573oWSKM3jW.

## Where I stopped
- R17B (#685 #703 #706 #707): GO for all four flags (docs/flag-classification/R17B.md on this branch).
- RELEASE HEAD ALREADY ON GITHUB: claude/gate-bubbles-r17b = fab769b, pushed 18:35Z by the OLD Gate-Bubbles session (old account) after this session's fetch. Same 4 flags, same 7 FIXED_IN_PRODUCTION cases, on a529c29e; differs from mine only in the _about note.
- My equivalent head 1e58ef1 (main f53c409a + the gated preview + the same flip) is LOCAL ONLY: this session gets 403 pushing that branch, and fab769b makes it redundant. Its full npm test is green (857 files passed / 6 skipped; 18264 passed, 85 expected fail, 62 skipped), i.e. fab769b plus a merge of main f53c409a (docs + #675's replay case) passes.
- R17B verdict SENT to QA 21:55Z.
- NOW: 16c re-gate (gate name R16D) running on d7487833 in /home/user/gate/r16c, with production-flags.json + production-fixes.ts reverted to ec9f740 (uncommitted) so OFF = production; ON = + FORM_NAME_FROM_ROSTER, NEAR_MISS_QUESTION_RULES, NEAR_MISS_DETAILS_ACCEPT, FORM_NAME_OFF_ROSTER_ASK; --with prodenv.csv.
- (old) On RESUME, first action: send QA "R17B GO; release head fab769b (old session) on a529c29e; merging main f53c409a is clean and the full suite is green on that tree (my 1e58ef1)".

## Queue (next first) — after QA's split 23:18Z; Gate-Bubbles-2 owns the rest
1. DONE: 16c re-gate R16D = HOLD (false not-found note for a shared first name, FORM_NAME_FROM_ROSTER); verdict sent 11 Nov ~00:10Z
2. DONE: EXCERPT_BRAND_FILTER GO (0 changed; probe proves the flag reaches rowToCitation); verdict sent 03:10Z. Was: flag-only (HIGH), gate EBF on main 59526ed in /home/user/gate/ebf; OFF = prodenv + main production-flags on (adds the 4 R17B flags; scratch prodenv-59526ed.csv); paths + src/lib/knowledge
2b. NOW (gate R16E, /home/user/gate/r16e, tree 290a2290): 16c re-gate on r16c @ 952bdeb (Coding-2 Tamsin fix) + #716 caf15503 merged; BOTH arms the 4 roster flags; ON + NEAR_MISS_ANSWER_KEEPS_REQUEST. Bar: P7 note gone (replay nov11-shared-first-name-not-found-{p7,bare}), s14 path-1 date kept, nothing new.
3. (folded into 2b) #716 NEAR_MISS_ANSWER_KEEPS_REQUEST @ caf15503 (16c's 4 flags in both arms; bar: s14 path 1)
4. #720 TYPO_CORRECTED_SAME_PERSON @ 7de59a2 (s14 path 2; read saved date)
5. #705 (sf-s16/s17/s19), #710, #712 (131400e9), #713, #714, #718 (3cb4e25f)
6. B504 d71d2d50; #678+#684; #695 (revision.ts diff = approved lines); #663 6c68b998+A3+#693, then #709; #681; PROPOSAL_NAME_CORRECTION
7. #686, #689, #691 (#694 moved to Gate-Bubbles-2 with #688+#724)
8. #697+#647 (+POLICY_LINE port); #698, #500, #480, #702, #464, #704, #708; #690 @ 47c7ef9c (Observation OFF vs ON); A7, A8, A9

Gate-Bubbles-2 (session_01VVEkRTubRY6Gy3uXrqxWfW) owns: #742 #736 #719 #723 #730 #721 #737 #725 #726 #696+#727 #687+#728 #692 #729 #733 #734 #735 #739 #688+#724 #722 #743 #744 #731 #740 #745.

Replay-case mapping and other notes:
    #690 fixed head 47c7ef9c (Coding-4), same queue slot; compare saved Observation OFF vs ON
    #718 LETTER_GREETING_ANY_CASE (Coding-6, 3cb4e25f): after #714, single flag, standard gate
    STANDING RULE (Pau via QA, 10 Nov): never call Vercel API / curl api.vercel.com / Vercel tools. Gate arms use prodenv.csv / production-flags.json (QA-verified, 0 mismatches).
    HIGH #719 POLICY_GATE_NONBLOCKING + NEXT_PUBLIC_POLICY_GATE_NONBLOCKING (Coding-5, 77612648, supersedes #174): right after 16c, with EXCERPT_BRAND_FILTER. Server flag + NEXT_PUBLIC_ twin always together (ON: both; OFF: neither).
    #720 TYPO_CORRECTED_SAME_PERSON (Coding-2, 7de59a2; form-proposal.ts verified = Pau patch ca4d0a01): s14 path 2, right after #716 (path 1, follows 16c — #716 never queued to me). s14 replay case should hold with ON; read saved date OFF vs ON.
    CONFIRMED ORDER after 16c: (1) EXCERPT_BRAND_FILTER (2) #719 (3) #716 (4) #720, then #705, #710, #712, #713, #714, #718, ... as handoff.
    #716 = NEAR_MISS_ANSWER_KEEPS_REQUEST_ENABLED, Coding-2, caf15503 on claude/near-miss-answer-keeps-request, stacked on gate-bubbles-r16c. Both arms: 16c's four flags ON; ON arm adds this flag. Bar: s14 path 1 holds (date survives near-miss answer). (Replaces handoff queue item 19.)
    #721 D1 CORRECTION_PLAN_KEEPS_AMOUNT (Coding-4, e1d8c889; replay nov10-correction-plan-keeps-amount-{change,repeat}): live prod defect, after #720. Read saved Action Plan amount OFF vs ON.
    REPLAY CASES each PR must close (Coding-6 mapping):
     #688: nov4-live-street-address-not-a-person, nov3-stepb-date-as-given, nov5-sf-b6-reply-full-sentence
     #688+#694 gated TOGETHER once: nov5-sf-b6-full-sentence-and-added-detail holds with both
     #686: nov5-twin-sf-s22-ca-not-coaching
     #698: nov5-twin-sf-s26-edit-misspelled-ca
     #691: nov4-ca-sales-wrong-items-card
     #668: nov4-scan-sf-s13 (#668 not in my queue — ask QA when reached)
     #705: sf-s16/s17/s19
    #722 CAPS_PREPOSITION_NOT_NAME (Coding-6; 'BY <NAME>' caps): after #718. Off-roster twins stay OPEN by design (GROUNDED_ENTITIES off) — not a regression.
    HIGH #723 BRAND_REPLY_GUARD (Coding-5, rebuild of #198; replies naming JB & Associates / SALON/STORE): right after #719. HIDDEN_TEMPLATE_KEYS (Coding-5, config-only, hides 6 sibling EPP templates) coming — goes beside #723. ORDER after 16c: EXCERPT_BRAND_FILTER, #719, #723(+HIDDEN_TEMPLATE_KEYS), #716, #720, #721, #705...
    #725 (Coding-6) SECOND_PERSON_ACCOUNT_WORDS + CROSS_PERSON_OWN_TURNS (B's card no longer takes A's "no payroll deduct"; live bug; supersedes #155/#166): after #722.
    #724 (Coding-6) copy-paste "make that update": stacked on #688 -> gate WITH #688 (so #688+#694+#724 group).
    COMING (Coding-6): ports of r23 fixes stacked on #696 / #687 -> gate each pair together on arrival.
    #719 HEAD UPDATED -> 998c4459 (not 77612648): + audit marker at finalize + honest 'blank, not checked' summary line. Must include a replay case with a blank Direct policy draft so the summary line is reached (check PR has one; else flag to QA).
    #726 NO_CARD_NO_DRAFT_CLAIM (Coding-6, Bubbles only, supersedes #164): after #725. Main now f53c409a (#675 merged, test only) — base future gates on current main.
    #727 SAME_REQUEST_OFF_ROSTER (on #696) -> gate #696+#727 once; #728 PASTED_OUTLINE_TO_OPEN_DRAFT (on #687) -> gate #687+#728 once. HOLD both pairs until Coding-6 merges main into #696/#687 (#696 was pre-16b base). Slots: with #696 / #687.
    STACKS NOW ON main f53c409a — no longer held:
     #696 @ 12db873c + #727 @ 680a7798 (SAME_REQUEST off roster) — gate together
     #687 @ 2b6eceb6 + #728 @ 73ff31ea (pasted outline) — gate together; TEMPLATE_OUTLINE_FIELDS NOT in Bubbles prod -> part of the ON unit
     #726: flag is in CHAT_QUALITY_FLAG_NAMES -> ON arm must use FLAG_CLASSIFY_ON (check harness passes it)
    LOW, END OF QUEUE: #731 REVISION_ARCHIVED_NOT_OPEN (Coding-2, 66569425; instances.ts verified = Pau patch; migration already in prod). Check: archived revision draft not reopened ON; nothing changes OFF.
    #732 BC_NOT_A_NAME (Coding-6, Oct rebuild; guards, Bubbles already holds on prod): end of queue, before #731.
    #733 NAME_CASE_INSENSITIVE (Coding-6, supersedes #202): HOLD until Coding-2 adds server-ask wiring; end of queue, before #731.
    #730 (Coding-5, rebuild of #200, brand): card opener repeated + "JB & Associates" in EPP opener -> right after #723.
    #729 RELATIVE_BESIDE_TYPED_DATE (Coding-5): after #726.
    #719 HEAD NOW c4cc11a4 (has blank-Direct-policy replay case reaching summary line; fails on old code with flag ON). Gate THAT head.
