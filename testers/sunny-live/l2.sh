#!/bin/bash
# one turn: l2.sh <set> <turn> "<text>" [conv]
: "${SUNNY_EMAIL:?set SUNNY_EMAIL in the shell, never in a file}"
export PREFIX=loop2 NOSALON=1 FULLFP=1
node loop.js "$@" 2>&1 | grep -vE "^(HOW|FP_KEYS|FORMS_WRITES \[\]|CARD )|^FIRST_WORDS" | sed 's/^SAVED .*resp\//SAVED /' | cut -c1-900 | head -40
