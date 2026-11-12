# Gate-Bubbles-4: #807 NAME_CORRECTION_KEEPS_DATE_ENABLED, head be3fcb57 (Coding-6): GO
- Base c6e0b7d (325 production flags). Conflict in chat-quality-flags.ts: kept both (verifyfns 0). tsc clean. 1 OFF + 1 ON.
- 13750 tests. Changed 2: INTENDED 2, REGRESSION 0. Nothing else in the suite or the replay pack moved.
- nov10-r22-s14-date-kept-after-name-correction (OPEN) holds: after "Oops, it's Rozlyn quellmar" the follow-up coaching card keeps the date given on turn 2. OFF fails (the date check got no string). The replies are byte-identical OFF vs ON; only the saved card/date differs.
