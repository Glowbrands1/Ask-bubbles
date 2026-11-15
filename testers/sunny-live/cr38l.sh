#!/bin/bash
# usage: cr38k.sh <conv> <tag> — Create once, then read the saved draft by its id
out=$(node create.js $1 2>&1); echo "$out" | grep -E "CREATE_BUTTONS|CLICK_UTC|DONE_UTC|DRAFT_IDS|ERR|NO BUTTON"
id=$(echo "$out" | grep DRAFT_IDS | awk '{print $2}' | cut -d, -f1)
if [ -n "$id" ] && [ "$id" != none ]; then node readdraft.js $id $2 | head -1; f=$(ls -t ../s38l-bodies/s38l-$2-* | head -1); python3 draft38k.py $f; cp $f ../resp/; fi
