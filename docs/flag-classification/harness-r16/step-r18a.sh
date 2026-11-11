#!/bin/bash
cd /home/user/gate/r18a
FIRST=$(head -1 /tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/r18a-on.txt); REST=$(tail -n +2 /tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/r18a-on.txt | paste -sd,)
mkdir -p /tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/tmp-x
RESUME_DIR=/tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/ck-r18a STOP_AFTER_ONE=1 GATE_NAME=R18A TMPDIR=/tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/tmp-x node /tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/harness/flag-classify-resume.ts --flag $FIRST --and $REST --with $(cat /tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad/prodenv.csv) --runs 3 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms
