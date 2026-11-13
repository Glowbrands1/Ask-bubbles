#!/bin/bash
cd /home/user/gate/b865
mkdir -p /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/tmp-x /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/ck-b865
RESUME_DIR=/tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/ck-b865 STOP_AFTER_ONE=1 GATE_NAME=B865 TMPDIR=/tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/tmp-x node /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/harness/flag-classify-resume.ts --flag POLICY_NOT_FOUND_PLAIN_WORDING_ENABLED --with $(cat /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/prodenv-86abc8f0.csv) --runs 1 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms
