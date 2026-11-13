#!/bin/bash
cd /home/user/gate/b848c
mkdir -p /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/tmp-x /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/ck-b848c
RESUME_DIR=/tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/ck-b848c STOP_AFTER_ONE=1 GATE_NAME=B848C TMPDIR=/tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/tmp-x node /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/harness/flag-classify-resume.ts --flag CA_NO_POLICY_ASKS_WHICH_ENABLED --with $(cat /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/prodenv-6d862bbe.csv) --runs 1 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms
