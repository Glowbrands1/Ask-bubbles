#!/bin/bash
# usage: finalize.sh <pr> <FLAGS> : reclassify from cached checkpoints (classes json already in worktree)
S=/tmp/claude-0/-home-user-Ask-bubbles/41362221-2fed-57a9-8109-f63b71f98b64/scratchpad
N=$1; FLAGS=$2; [ "$N" = 745 ] && FLAGS=STORE_ALIAS_ENABLED,MANAGER_FORM_CHOICE_ENABLED; cd /home/user/gate/p$N
PROD=$(python3 -c "import json;d=json.load(open('src/config/production-flags.json'));print(','.join(sorted(set(d['on']+d.get('assumedOn',[]))-set('$FLAGS'.split(',')))))")
FIRST=${FLAGS%%,*}; REST=${FLAGS#*,}; [ "$REST" = "$FLAGS" ] && REST=""; AND=""; [ -n "$REST" ] && AND="--and $REST"
RESUME_DIR=$S/ck/p$N GATE_NAME=R$N TMPDIR=$S/tmp/p$N node $S/harness/flag-classify-resume.ts --flag $FIRST $AND --with $PROD --runs 1 src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms 2>&1 | tail -2
