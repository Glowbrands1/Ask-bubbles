# HANDOFF — Coding-4 (13 Nov 2026)

## Role
Coding session reporting to QA (session_01VVEkRTbAAAt573oWSKM3jW). I fix chat and forms bugs in Ask Sunny
(Glowbrands1/ask-sunny) and Ask Bubbles (Glowbrands1/Ask-bubbles). Every fix sits behind a default-off flag, comes with
replay cases in the reporter's wording (invented names), gets ported to the sibling app or gets a parity-log entry, and
is checked with a whole-pack diff (flag off vs on) before I report it. The gates (Gate-Sunny session_01VVEkRSFxDxKtecG8PQL6z6,
Gate-Bubbles session_01VVEkRSBWpwpmDNGmw4pmfW, Gate-Sunny-3 session_01VVEkRTfSdtNumqyJyVuXQA) probe each PR and say GO or NO-GO.

## In flight now
- **Sunny #939** `claude/work-area-not-title` @ **2af39bee**. It carries two flags:
  - WORK_AREA_NOT_A_TITLE: "front desk", "register", "bed 4" are never the Job title. Gate said GO.
  - OBSERVATION_NO_LEADING_NAME: drops "Employee A" from the start of "Employee A at the front desk, she was rude…".
    Reworked to Gate-Sunny's rule: the name goes only when the at/in/on phrase is exactly a work area, "close", a read
    salon, or "her/his/their phone", and nothing follows but a comma, a full stop, the end, or she/he/they. There is no
    verb list. Gate's 4 keep-the-name guards and a "bed #4" case are added.
  - Step: pushed, and Gate-Sunny and QA are told. **Waiting for Gate-Sunny's ruling** on 2 pack rows that now KEEP the
    name ("<A> at West Dodge Rd, she…", a street; "<A> at grand islnd, he…", a misspelled salon the reader can't read).
    Options: accept them, or add a close-spelling match of salon words for the second.
  - ETA: as soon as Gate-Sunny answers.
  - Parity: docs/parity-log/2026-11-13-observation-no-leading-name.md (Bubbles not needed: its card shows an Issue line
    with no name).

## Queue, in order
1. Sunny #936 `claude/place-strip-whole-phrase-only` @ cb50f257 (PLACE_STRIP_WHOLE_PHRASE_ONLY). QA took option (b).
   Waiting on the gate or merge.
2. Bubbles #869 @ 0f0a5a2b: the follow-up where only compass words are allowed before "of". Release #870 already carries
   3c900125. Gate this as a follow-up.
3. Sunny #933 `claude/shared-city-asks-salon` @ 395de43c (SHARED_CITY_ASKS_SALON). Passed all 77 Gate-Sunny probes; a
   1+1 run was in progress.
4. HEADING_DISTINCTIVE_WORDS: Bubbles #867 @ 3bb6a3bd, Sunny #934 @ 73903876. Pack diffs are clean. Waiting on the gate.
5. POLICY_NOT_FOUND_PLAIN_WORDING: Bubbles #865 @ 725bf432, Sunny #931 @ 6646d51b. In the next gate batch.
6. Key-holdr guard (test only): Bubbles #864 @ 79ab8c5f, Sunny #932 @ 564d37fe.
7. Bubbles (low, QA approved): keep "at the front desk" in the card's Issue line, under a new default-off flag.
   Code: incident-issue.ts (titleAndPlaceOnly / issueFromRequest). No branch yet; start from main.
8. Older NO-GO and rework items from my task list (each still needs a re-check against current main):
   - Bubbles #776 / Sunny #844 sf-b5: keep the confirmation question. After "yes", open the card, keep the stated
     level and the preferred name.
   - Sunny r36: the Written warning tick is lost (warning_type NULL); there is a stale "draft left out <A>" notice.
     Both apps. FIRST_NAME_ENOUGH is Bubbles #838.
   - Sunny r37: SECTION_SPACING (Sunny #908 / Bubbles #841); "once the DM approves" (Sunny #912 / Bubbles #847);
     "just make it" (Sunny #921 / Bubbles #850).
   - Bubbles 17p: a coaching draft saved without coaching_type/topic. Blockquote renders as one line: Sunny #905.
   - Bubbles 17q: REPLY_QUOTE_WHOLE_SENTENCES is Bubbles #856. Sunny #904 plan line-break still needs porting to
     Bubbles.
   - High, Bubbles #802 follow-up: a labelled "Name:/Date:/Observation:" paste on an open card is read as a NEW
     request. Port to Sunny #875.

## Findings not yet acted on
- Bubbles: "because she was at sioux falls west" is read as a store (Gate-Bubbles-3). Needs a case and a fix.
- Sunny: "at lincoln street fair" is read as a Lincoln salon. Needs a case and a fix.
- #939: the 2 pack rows above. Waiting on Gate-Sunny's ruling.
- Bubbles #802: another person's pasted outline ("She did not call …") is still kept. Do this later, on a new branch.

## Branches I own with no PR
- `claude/coaching-type-stated-ticks`, Bubbles @ 771e92a7 and Sunny @ a121f730: COACHING_TYPE_STATED_TICKS (a coaching
  type the manager names is ticked). PAUSED. These were local-only until today; I pushed them for the handoff. They are
  well behind main (Bubbles 270 commits, Sunny 53). Merge main before you use them.
- Bubbles `claude/rec-663-main-merge` @ c5672f1e, `claude/rec-709-main-merge` @ 3ad3c58d,
  `claude/rec-779u-main-merge` @ 890a01df: main merged into recovery-group-3 branches (#663, #709, #779). Local-only
  until today. They hold merge commits only; the source PR branches are not rewritten.
- Sunny `claude/full-manual-keeps-retrieval-wip`, the `*-wip` d2/d3/d4/d5 branches (both apps), and
  `claude/store-choices-named-wip`: older parked work, all pushed.

## Scheduled reminders I set
- None active. The 3 enabled reminders on the account belong to other sessions (QA, Coordinator, another coder).

## Files on my disk the next session needs
- My scratchpad, which goes away with this session:
  - Flag-on pack records for #939: sn-wa-on.jsonl (c3aec37c) and wa-pack-on-v3.jsonl (2af39bee). Regenerate them;
    don't hunt for them.
  - pack-diff.py, the whole-pack diff helper. Full text:
```python
import json, sys
def load(p):
    out = {}
    for line in open(p):
        r = json.loads(line); out[(r["id"], r["mode"])] = r
    return out
base, on = load(sys.argv[1]), load(sys.argv[2])
changed = []
for key in sorted(set(base) | set(on)):
    a, b = base.get(key), on.get(key)
    if a is None or b is None:
        changed.append((key, "missing in " + ("base" if a is None else "on"), "")); continue
    if a["ok"] != b["ok"] or json.dumps(a["turns"], sort_keys=True) != json.dumps(b["turns"], sort_keys=True):
        why = f"ok {a['ok']}->{b['ok']}" if a["ok"] != b["ok"] else "turns differ"
        detail = next((f"turn {i+1}" for i, (x, y) in enumerate(zip(a["turns"], b["turns"]))
                       if json.dumps(x, sort_keys=True) != json.dumps(y, sort_keys=True)), "")
        changed.append((key, why, detail))
print(f"{len(base)} base rows, {len(on)} flag-on rows, {len(changed)} changed")
for (id_, mode), why, detail in changed: print(f"- {id_} [{mode}]: {why} {detail}")
```
- How to run a whole-pack diff (a plain flag env var is wiped by the harness; use FLAG_CLASSIFY_ON):
  `REPLAY_RECORD=base.jsonl npx vitest run src/app/api/chat/replay-pack/replay-pack-e2e.test.ts`, then
  `FLAG_CLASSIFY_ON=FLAG_A,FLAG_B REPLAY_RECORD=on.jsonl npx vitest run …same…`, then
  `python3 pack-diff.py base.jsonl on.jsonl`.
  With the flag forced on, "open" cases that now hold show as "Expect test to fail". That means the fix works.
- Worktrees: /home/user/{bb-*,sn-*} are git worktrees of /home/user/Ask-bubbles and /home/user/ask-sunny. All are
  clean, and every branch is pushed (git status, stash list and unpushed log are empty as of 21:3x Z).

## Rules I follow
- No Vercel API (only QA). Read-only on the DB. Never read production rows except QA-authorized test data.
- Invented names only, in code, tests, PRs and messages. Never quote production wording.
- location-scope.ts, proposal.ts and form-proposal.ts are protected: send QA the hunk first. server-ask.ts belongs to Coding-2.
- New behaviour goes behind a default-off flag. Sunny flags go in NEW_FLAGS (flags-off-parity.test.ts); Bubbles flags
  go in CHAT_QUALITY_FLAG_NAMES.
- Each fix gets a replay case: `status: { open }` plus fixFlags; guards are `status: "fixed"` plus fixFlags.
- Port to the sibling app ("Port from Ask X (<sha>): …") or write a docs/parity-log/ entry.
- Run lint, `tsc --noEmit` and the touched tests before pushing. Do a whole-pack diff before reporting.
- Check a PR is OPEN before pushing to it. Never force-push. Merge main rather than rebase; don't rewrite others' branches.
- Gates run one at a time. Tell the gate the new head after every push.
- Commit trailers: Co-Authored-By plus the Claude-Session line. GitHub posts end with the "Generated by Claude Code" footer.
- No `rm` with an unguarded variable path; use literal paths.

## First 3 things for my successor
1. Read Gate-Sunny's reply on #939 @ 2af39bee about the 2 rows that now keep the name. Act on it. If it's GO, tell QA
   so it goes to merge.
2. Ask QA where #936, #933, #867/#934 and #865/#931 stand in the gate queue, and answer any NO-GO.
3. Start the Bubbles "keep at the front desk in the Issue" flag (queue item 7), then the two place-reading findings.

## FREEZE addendum (pushed 14 Nov ~06:40Z; QA's asks after the handoff)
- QA's #865/#864 list: (1) merge main b9720947, keep both on conflicts; (2) tests pinning the old line hold the flag
  off; (3) follow-up: the form beside the card still says "Woven does not see …" (inline-form.tsx policy notes,
  POLICY_ACKNOWLEDGEMENT_TITLE in policy-verification.ts, policy-grounding.ts:173). Separate default-off flag. NOT STARTED.
- (1)+(2) done, on WIP branches. PR heads were NOT moved, because of the freeze:
  - Bubbles `claude/policy-not-found-plain-wording-wip` @ 04ee81de (#865 + main + test fix). Full npm test GREEN
    (20386 passed, 23 expected fail).
  - Bubbles `claude/close-spelling-key-holdr-guard-wip` @ 4f8ba607 (#864 + main; keep-both in
    nov13-close-spelling-cases.ts). Full npm test GREEN (20385 passed).
  - Sunny `claude/policy-not-found-plain-wording-wip` @ e7bb344b (#931 + main; keep-both in flags-off-parity, chat-quality-flags,
    ca-policy imports; test fix ported). tsc and lint clean. The 6 pinned files pass with the flag on.
    flags-off-parity.test.ts was still running and NOT verified.
  - Sunny `claude/close-spelling-key-holdr-guard-wip` @ 2c735e85 (#932 + main, merged clean). Not run.
  - Resume: fast-forward each PR branch to its -wip head (`git push origin <wip-sha>:<pr-branch>`), then tell Gate-Bubbles
    the heads for a quick delta, then do item (3).
- Sunny #936 (cb50f257): QA and Gate-Sunny ask to merge main efd3ce9a. There are conflicts in remap-incident.ts imports
  (keep both isCloseSharedCity and continuesPlaceName, and keep the SHARED_CITY behaviour), chat-quality-flags.ts and
  flags-off-parity.test.ts. Then run the nov13 place and shared-city cases with SHARED_CITY_ASKS_SALON_ENABLED plus the
  flag on, push, and tell Gate-Sunny. QA ranked this FIRST. NOT STARTED (the freeze came first).
- Sunny worktree sn-pw: `npm install` replaced its node_modules symlink with a real copy (main added react-markdown etc.).
