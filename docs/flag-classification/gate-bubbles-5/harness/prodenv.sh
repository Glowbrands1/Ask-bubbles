#!/bin/bash
# prints the production flag list (on + assumedOn) of the worktree in $1, comma-joined
node -e 'const j=require(process.argv[1]+"/src/config/production-flags.json");console.log([...j.on,...j.assumedOn].join(","))' "$1"
