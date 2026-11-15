#!/bin/bash
# usage: lt.sh <set> <turn> "<text>" [conv]
: "${SUNNY_EMAIL:?set SUNNY_EMAIL in the shell, never in a file}"
node loop.js "$@" 2>&1 | awk '/^REPLY>>>/{r=1} {if(r){n+=length($0); if(n<2200) print} else print}' | cut -c1-600
