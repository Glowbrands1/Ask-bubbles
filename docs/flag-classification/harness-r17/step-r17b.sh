#!/bin/bash
cd /home/user/gate/r17b
FIRST=$(head -1 $SCRATCH/r17b-on.txt); REST=$(tail -n +2 $SCRATCH/r17b-on.txt | paste -sd,)
mkdir -p $SCRATCH/tmp-x
RESUME_DIR=$SCRATCH/ck-r17b STOP_AFTER_ONE=1 GATE_NAME=R17B TMPDIR=$SCRATCH/tmp-x node $SCRATCH/harness/flag-classify-resume.ts --flag $FIRST --and $REST --with $(cat $SCRATCH/harness/prodenv.csv) --runs 3 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms
