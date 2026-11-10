#!/bin/bash
while true; do bash $SCRATCH/solo-r17b.sh; rc=$?; [ $rc -ne 0 ] && break; done; echo "SOLO DONE rc=$rc"
