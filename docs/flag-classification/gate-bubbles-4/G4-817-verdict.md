# Gate-Bubbles-4: #817 TERMINATION_INTAKE_ENABLED, head 88c8d01e (Coding-6): GO, ship with #822
- Base main 2593987 (335 production flags). Conflict in chat-quality-flags.ts: kept both (verifyfns 0). tsc clean. 1 OFF + 1 ON.
- 13962 tests. Changed 28: INTENDED 4, INTENDED-ADJACENT 24, REGRESSION 0. Every row is a replay case (2 OPEN plus 12 cases × production/fix arms) whose first-turn termination text now opens intake instead of the free answer. Every case holds. The diff is wide but deterministic (stubbed models); its one cause is the reading this flag adds.
- INTENDED (OPEN, now hold):
  - nov12-termination-ca-bare-opens-card: "Termination CA for <A>, no call no show." gives a CA card (Attendance p.14).
  - nov12-17k-termination-letter-exit-card: "Dear <C>, Your employment with Buff City Soap is terminated effective 11/10/26." gives her Resignation/Exit Form card (Immediate involuntary separation, 11/10/26).
- INTENDED-ADJACENT:
  - Letters at T1 (Dear Orla …, Marcus Tellefsen …, Dear Marcus …) now open the Exit card. Where T2 resends the request with the letter, T2 takes the card-already-shown path: "Your account covers every store, so this form won't name one …" instead of OFF's "Which store is this for?" and the job-title question (both stay in the T1 card's "Left blank" list).
  - Dorran letter alone at T1: "Who is this **Resignation/Exit Form** for? …" (OFF: free answer). T2 adds "I still need to know who this is for before I can make this card."
  - nov9-letter-greeting-hi-first-name: T1 now asks "Is this for **Marcus Tellefsen**?". T2 (the request resent) answers "Who is this Resignation/Exit Form for?" The name is lost: the existing resend-after-name-question loss Coding-6 reported, which #822 RESENT_REQUEST_IS_YES fixes. Ship #817 with #822.
