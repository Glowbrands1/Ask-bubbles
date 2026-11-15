#!/bin/bash
# one turn: l3.sh <set> <turn> "<text>" [conv]   (needs MASK_LEGEND and SUNNY_PASSWORD in env)
: "${SUNNY_EMAIL:?set SUNNY_EMAIL in the shell, never in a file}"
export PREFIX=loop3 NOSALON=1 FULLFP=1
node loop.js "$@" 2>&1 | grep -vE "^(HOW|FP_KEYS|FORMS_WRITES \[\]|CARD |SAVED)|^FIRST_WORDS" | sed -E 's/"(supportsInlineDraft|variantKey|templateKey)":[^,]*,//g' | cut -c1-700 | head -30
