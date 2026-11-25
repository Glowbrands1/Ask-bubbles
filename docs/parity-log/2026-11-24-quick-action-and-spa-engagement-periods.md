## 24 Nov 2026: Review Daily Stats shortcut (Sunny 8a9dc8814) and Spa Engagement's mixed periods — not needed here

Ask Sunny's QA (24 Nov 2026, live) found two page problems (Sunny 8a9dc8814 and 8b8305314) this app does not have:

- **"Review Daily Stats" linked to `/reports`, which redirects to Salon Performance** (Sunny's
  `src/data/quick-actions.ts`). Sunny now opens the chat with a Daily Stats question that its agent
  loop's read_stats answers. This app's Home has no Daily Stats shortcut: its quick action is
  "Open reports", which goes to `/reports`, a real Reports page (no redirect), and this app has no
  Daily Stats report or read_stats for the loop. Nothing to port.
- **Spa Engagement's headline row mixed periods** (Spa Conversion Rate for the newest period Bed
  Usage and Spa Wellness share, the cards beside it for the page's own period). Sunny's cards now
  each name their period and the row says when it holds two. This app has no Spa Engagement, Bed
  Usage or Spa Wellness report (its reports are `/reports/[reportId]`), so there is no such row.
  If one is ported, port `spaHeadlinePeriods` (Sunny's `lib/reporting/read/bed-spa/headline-periods.ts`)
  and `KpiCard.period` with it.

The other two fixes from the same report (one overdue count across Home, the rail, the Forms Register
banner and pills, read by the AI as read_follow_ups; the HR reminder's "No HR approval is overdue yet")
are ported in their own commits.
