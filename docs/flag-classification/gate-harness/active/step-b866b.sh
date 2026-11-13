#!/bin/bash
cd /home/user/gate/b866b
mkdir -p /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/tmp-x /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/ck-b866b
RESUME_DIR=/tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/ck-b866b STOP_AFTER_ONE=1 GATE_NAME=B866B TMPDIR=/tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/tmp-x node /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/harness/flag-classify-resume.ts --flag ANSWER_IS_THE_ISSUE_ENABLED --with $(cat /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/prodenv-6081b825.csv) --runs 1 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms
