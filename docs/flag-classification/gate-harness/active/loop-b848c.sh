#!/bin/bash
while true; do bash /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/step-b848c.sh >> /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/b848c.log 2>&1; rc=$?; echo "STEP rc=$rc $(date -u +%H:%MZ)" >> /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/b848c.log; [ $rc -ne 75 ] && break; done
echo "LOOP DONE rc=$rc" >> /tmp/claude-0/-home-user/a000b4f1-15c8-55c5-881c-1a4ddf9a5a52/scratchpad/b848c.log
