# Location reconciliation — Buff City Soap (Midwest)

Status as of 12 Oct 2026. **No cross-system match is asserted that has no evidence.** Where evidence is missing the row says so and stays visible for an administrator.

Three systems name the same stores differently and their numbers overlap without agreeing. A store code is not a Woven location ID and not an Ask Bubbles location ID. Nothing below is inferred from number equality across systems.

## Source facts

| System | What is known | Source |
|---|---|---|
| Google Business Profile | 7 approved stores, all Verified (table below) | Confirmed by Buff City Soap |
| Woven (Midwest Soap Makers, `55839F24-9241-418C-8405-37BAF9A42A87`) | 9 locations; 12 distinct primary-location IDs on employees. Names, numbers and addresses **not yet read** (catalogue probe prepared, not run) | Verified read-only counts |
| Ask Bubbles roster (`src/config/company/locations.ts`) | Empty — no configured locations | Repository |

## Google side (known)

| Source system | Source location ID | Store code | Display name | Address | Active/closed | Cross-system match | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| Google | resolved on first linked sync | 219 | Lee's Summit, MO | 2050 NW Lowenstein Dr, Ste C, 64081 | Verified/open | None yet | n/a | Address and code supplied by Buff City Soap |
| Google | resolved on first linked sync | 225 | Sioux Falls, SD | 4025 W 41st St, 57106 | Verified/open | None yet | n/a | same |
| Google | resolved on first linked sync | 236 | Grand Island, NE | 3429 W 13th St, Ste B, 68803 | Verified/open | None yet | n/a | same |
| Google | resolved on first linked sync | 264 | Omaha, NE | 7810 West Dodge Rd, 68114 | Verified/open | None yet | n/a | same |
| Google | resolved on first linked sync | 338 | Sioux Falls, SD | 5902 E 18th St, 57110 | Verified/open | None yet | n/a | same |
| Google | resolved on first linked sync | 66 | Kearney, NE | 5210 2nd Ave, 68847 | Verified/open | None yet | n/a | same |
| Google | resolved on first linked sync | 67 | Bellevue, NE | 10110 S 15th St, Ste 104, 68123 | Verified/open | None yet | n/a | same |

Google resolution rule (implemented and tested): a profile links to a store only when its **store code and street address both match**. Code-only or address-only matches are recorded as `mismatch`; a single address-only profile with no code is a `candidate` that an administrator may confirm. Google resource IDs are never guessed; they are recorded when a connected sync links them.

## Woven side (unmatched — needs data)

| Source system | Source location ID | Store code | Display name | Address | Active/closed | Cross-system match | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| Woven | 9 locations, IDs unread | unread | unread | unread | unread | **Unmatched** | none | Catalogue not yet read |
| Woven | 12 employee primary-location IDs | — | — | — | — | **Unmatched** (3 IDs are not among the 9 locations or are unlisted until proven) | none | Counts only |

The 12 distinct employee location IDs versus 9 Woven locations means at least three employee location IDs do not correspond to a catalogue location (closed, non-location or cross-company). They must stay visible in the Woven screen's location mapping queue (`woven_location_map`, status `unmapped`) for review. They are never dropped and never auto-assigned.

## How the match will be made (no invention)

1. Run the already-built read-only catalogue probe (`D:\Ask-Bubbles\woven-auth-diagnostic\woven-location-catalogue.mjs`) with the approved Midwest-only credential. It reads names, numbers, addresses and closed flags only.
2. Propose a match only when **Woven's location number equals the Google store code AND the street address agrees**. Number equality alone yields `candidate`, not `confirmed`.
3. An administrator confirms each Woven → Ask Bubbles location mapping in the existing mapping queue. The Google link is independent of it: **Google reviews are restricted to the seven approved stores regardless of any Woven mapping.**

## Brand isolation

Fifteen other-brand profiles share the Google account. They are rejected by the matcher before any comparison and are never stored or counted beyond a number in a run report.
