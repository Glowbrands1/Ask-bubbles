# Ask Sunny live-test helpers (tester WIP)

Playwright helpers used for card-only live tests of Ask Sunny (ask-sunny.vercel.app).
They are not part of the app and are not run by CI.

## Safety
- The login comes from the environment only: `SUNNY_EMAIL`, `SUNNY_PASSWORD`. Never put either in a file.
- Real staff names come from `MASK_LEGEND` in the environment ("Full Name=<A>;..."); runners
  refuse to start without it, and every saved body is masked with it. Never write the legend to a file.
- `l6.js` aborts every non-GET request to `/api/forms/**` (cards only, nothing is saved).
  `formchat.js` aborts any write or chat aimed at a form other than test drafts A/B.
- Bodies are written to `../resp/` (outside this folder). Do not commit them.

## Main entry points
- `l6.js <tag> "<turn>"` (with optional `CONV=conv_...`): one chat turn, masked, timed, with card fields.
- `formchat.js`, `cstep.sh`: turns against test draft A/B, with re-read and field diff (`formsnap.js`, `fdiff.py`).
- `resetA.js`, `restoreB.js`: restore by hand on the form card, with a request guard.
- `pick.js`: read-only list of employee names in the forms register (stdout only).
