#!/bin/bash
# cstep.sh <tag> "<text>" : one turn in the open-A chat, then re-read A and diff vs the previous snapshot
: "${SUNNY_EMAIL:?set SUNNY_EMAIL in the shell, never in a file}"
cd "$(dirname "$0")"
prev=$(ls -t ../resp/form-A3-* | head -1)
CONV=conv_mwhk103r2wrucnt timeout 200 node formchat.js "loop3-$1" "$2" | grep -vE "^REQ"
timeout 90 node formsnap.js a3e11f25-54d8-599c-9b3b-b60bb2bb913d "A3-$1" | head -1 | sed 's/.*SAVED .*resp\//SAVED /'
cur=$(ls -t ../resp/form-A3-* | head -1)
python3 fdiff.py "$prev" "$cur"
