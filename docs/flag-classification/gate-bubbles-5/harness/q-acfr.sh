#!/bin/bash
S=/tmp/claude-0/-home-user-Ask-bubbles/d8d175bd-e304-5d48-85ab-86bab041d4b7/scratchpad
cd /home/user/gate/pacfr || exit 1
mkdir -p $S/rec/acfr
echo "start #acfr $(date -u +%H:%M)" >> $S/queue.log
FC_DOCS=$S/rec/acfr TMPDIR=$S/tmp node $S/h/fc.ts --flag ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED --with "$($S/h/prodenv.sh .),ACCOUNT_REPLACED_CLOSE_SENTENCE_KEPT_ENABLED" --runs 1 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms > $S/rec/acfr/run.log 2>&1
echo "done #acfr exit $? $(date -u +%H:%M)" >> $S/queue.log
