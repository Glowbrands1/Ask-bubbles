## 15 Nov 2026: DM L10 Bloom-style Scorecard (part c)

Port from Ask Sunny #1043 (`42695fb`; Hub #98). On the Bloom-style DM L10 the Scorecard gets Add metric at the top,
weeks newest first with two-line heads, the current week's whole column shaded, rows grouped by owner with per-owner
avatar colours, and cells tinted green / red with empty boxes. `Scorecard.tsx` (`bloom` mode), `lib/bloom.ts`
(`weekRange`, `weekBounds`, `ownerColor`, `OWNER_COLORS`, `inWeek`) and the `MeetingView.tsx` prop are copied as they
are, with Sunny's tests (invented names).

Ask Bubbles differences (colour only): the Hub's accent tokens are declared inside `.hub-l10` from Ask Bubbles' own
--bcs-* tokens, following QA's approved plan: the current week in tokyo-tint with a tokyo-mist head (charcoal text,
7.79:1), and six owner pairs (tokyo-tint / tokyo-active 6.32, tokyo-mist / charcoal 7.79, magnolia / charcoal 7.41,
info-tint / tokyo-active 5.90, warn-tint / warn-ink 5.27, attention-tint / attention 4.85). No new colour values.
Owners 1, 4 and 5 draw their row bar in the ink colour, since their backgrounds are near-white. The contrast test
checks these pairings.

Sibling app: already in Ask Sunny (#1043, `42695fb`); this is its port. Sun Tan City's yellow tokens are not copied.
