#!/bin/bash
mkdir -p $SCRATCH/ck-r17b
# loop the checkpointed step until it no longer exits 75
while true; do bash $SCRATCH/step-r17b.sh >> $SCRATCH/r17b.log 2>&1; rc=$?; echo "STEP rc=$rc $(date -u +%H:%MZ)" >> $SCRATCH/r17b.log; [ $rc -ne 75 ] && break; done
echo "LOOP DONE rc=$rc" >> $SCRATCH/r17b.log
