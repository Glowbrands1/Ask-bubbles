# "Empire, SD" is the Sioux Falls W 41st St store: a reviewed nickname, read and stripped as the store's name (A7)

**Root cause (Ask Bubbles):** QA's live re-runs (22 Nov 2026, A7): "do verbal for team member <P> at empire, sd. …" and
"store location is empire, sd. create corrective action" were asked about every turn and never gave a ready card. No
store data named "Empire" (production's woven_location_map has "SD Sioux Falls" for the W 41st St store;
google_review_locations and the Woven affiliations have no Empire), so nothing could resolve it without a guess.

**Fix:** Pau confirmed (22 Nov 2026, via QA) that "Empire, SD" is the Sioux Falls W 41st St store (loc-225). It is a
reviewed company nickname, `COMPANY_LOCATION_NICKNAMES` { empire: "225" } (read by both store readers and the Woven-aware
store index; it was empty until confirmed), with `alsoKnownAs: ["Empire"]` on the store's Google entry beside "Dawley
Farms". A store's reviewed nicknames are its names for R13's stripping too (`withoutNamedSalon`), so "… at Empire, SD and
came into the store …" leaves the account. Store data and the existing readers; no word list in code. Three older tests
that assumed "Empire" was no store were changed on purpose (comments cite Pau).

Known gap (QA's ruling: a separate follow-up PR): the model sometimes rewords the place mid-sentence ("… came into the
store at Empire to show the team …"); code strips a place only where its whole phrase ends (#869), so that stays. The
follow-up hands the reply back with the store phrase the store reader matched, generically.

**Sibling app: not needed now.** Sunny has no Empire (a Buff City Soap store). Its salon reader has no reviewed-nickname
list, and its `withoutNamedSalon` reads the roster name only. The mechanism to port, if Sunny adds salon nicknames: a
salon's reviewed nicknames are its names when the account's place phrase is stripped.
