#!/bin/bash
# one.sh <n> <flag> <csv> [and-flags]
n=$1; f=$2; csv=$3; AND=""; [ -n "$4" ] && AND="--and $4"
mkdir -p /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-$n; cd /home/user/gate/g$n
[ -f /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/tsc-$n.log ] || { npx tsc --noEmit -p . > /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/tsc-$n.log 2>&1; echo "tsc $?" >> /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/tsc-$n.log; }
grep -q "^tsc 0$" /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/tsc-$n.log || { echo "$n tsc failed"; exit 2; }
RESUME_DIR=/tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-$n GATE_NAME=G4-$n TMPDIR=/tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/tmp-x node /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/harness/flag-classify-resume.ts --flag $f $AND --with $(cat $csv) --runs 1 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms > /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/run-$n.log 2>&1
echo "$n EXIT $?"; tail -1 /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/tsc-$n.log
