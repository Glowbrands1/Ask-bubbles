#!/bin/bash
# usage: gate-one.sh <pr> <FLAG>[,<FLAG>...]   -> worktree, merge, tsc, 1 OFF + 1 ON (production env base)
S=/tmp/claude-0/-home-user-Ask-bubbles/41362221-2fed-57a9-8109-f63b71f98b64/scratchpad
N=$1; FLAGS=$2; case $N in 745|745b) FLAGS=STORE_ALIAS_ENABLED,MANAGER_FORM_CHOICE_ENABLED;; esac; : STORE_ALIAS_ENABLED,MANAGER_FORM_CHOICE_ENABLED; W=/home/user/gate/p$N; L=$S/logs/p$N; mkdir -p $L $S/ck/p$N $S/tmp/p$N
export GIT_AUTHOR_NAME=gate GIT_AUTHOR_EMAIL=gate@local GIT_COMMITTER_NAME=gate GIT_COMMITTER_EMAIL=gate@local
cd /home/user/Ask-bubbles
if [ ! -d $W ]; then
  BASE=1471dab3; case $N in 832|pcf) BASE=815ae303;; 735b|745b) BASE=b3b8d525;; 853) BASE=$(git rev-parse 6d862bbe);; 869) BASE=$(git rev-parse 7d5b7bb2);; 869b) BASE=$(git rev-parse 6081b825);; esac; case $N in 504|678|684|695|681|819|734b|740b|pcf2) git fetch -q origin main; BASE=$(git rev-parse origin/main);; esac; echo "base $BASE" > $L/base.txt
  git worktree add -q -b gate3-p$N $W $BASE || exit 2
  cd $W && ln -s /home/user/Ask-bubbles/node_modules node_modules
  [ "$N" = 727 ] && { git merge -q --no-ff --no-edit refs/gate/pr696 > $L/merge0.txt 2>&1 || { echo MERGE-CONFLICT-BASE > $L/status; exit 2; }; }
  git merge -q --no-ff --no-edit refs/gate/pr$N > $L/merge.txt 2>&1 || { echo MERGE-CONFLICT > $L/status; git diff --name-only --diff-filter=U >> $L/merge.txt; exit 2; }
  git rev-parse HEAD > $L/head.txt; git rev-parse HEAD^{tree} >> $L/head.txt
fi
cd $W
if [ ! -f $L/tsc.ok ]; then npx tsc --noEmit -p . > $L/tsc.txt 2>&1 && touch $L/tsc.ok || { echo TSC-FAIL > $L/status; exit 3; }; fi
PROD=$(python3 -c "import json;d=json.load(open('src/config/production-flags.json'));print(','.join(sorted(set(d['on']+d.get('assumedOn',[]))-set('$FLAGS'.split(',')))))")
FIRST=${FLAGS%%,*}; REST=${FLAGS#*,}; [ "$REST" = "$FLAGS" ] && REST=""
AND=""; [ -n "$REST" ] && AND="--and $REST"
while true; do
  RESUME_DIR=$S/ck/p$N STOP_AFTER_ONE=1 GATE_NAME=R$N TMPDIR=$S/tmp/p$N node $S/harness/flag-classify-resume.ts --flag $FIRST $AND --with $PROD --runs 1 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms >> $L/run.txt 2>&1
  rc=$?; [ $rc -ne 75 ] && break
done
echo "DONE rc=$rc" > $L/status
