#!/bin/bash
# onB.sh <n> <flag> : OFF = main 6d862bbe baseline, ON = PR tree + flag
n=$1; f=$2
rm -rf /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-$n; mkdir -p /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-$n; cp /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-mainB/off-1.json /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-mainB/off-1.replay.jsonl /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-$n/
sed -i "s%/home/user/gate/gmainB/%/home/user/gate/g$n/%g" /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/ck-$n/off-1.json
/tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/one.sh $n $f /tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad/prodenv-6d86.csv
