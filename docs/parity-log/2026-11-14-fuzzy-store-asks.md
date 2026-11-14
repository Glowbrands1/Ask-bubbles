## 14 Nov 2026: FUZZY_STORE_ASKS stays Bubbles-only

QA's ruling (14 Nov 2026) on Gate-Bubbles-3's #869 probes: "ca for <A> at sioux falls west, she was late on 11/1/26"
gave **Store:** Sioux Falls, SD (W 41st St), as you said. The store resolver reads "sioux falls west" two letters off
"sioux falls 41st", and production's GLOBAL_STORE_ASK takes a single misspelt store silently. With
FUZZY_STORE_ASKS_ENABLED (default off) a close spelling more than one letter off is asked ("I read … as … — is that the
store?"); a one-letter typo or an initialism is still taken, as GLOBAL_STORE_ASK was designed. The change is in
`stores/resolver.ts` (a `loose` mention) and `forms/location-scope.ts` fromNamedLocations (QA-approved hunk).

Sibling app: not needed. Checked on Ask Sunny's #936 branch (main efc03f03), production flags, as an Admin: its
close-spelling reader (`forms/salon-mention.ts` closeSalonMentions) takes a salon only when one word is one letter off
("at grand islnd" → Grand Island, which QA's rule keeps); looser spellings ("at grnd islnad", "at grand isle west")
read no salon, so nothing is filed silently from them.
