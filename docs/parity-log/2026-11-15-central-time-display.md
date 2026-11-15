## 15 Nov 2026: times shown to people are in the business zone — ported from Ask Sunny (14a0d3fb)

Pau: both apps are Central time. `lib/business-date.ts` gains `formatBusinessTime` ("Nov 14, 6:01 AM CT") and
`formatBusinessDay` ("Nov 14"), from `BUSINESS_TIMEZONE`; the label comes from the zone, so a different business zone shows
its own. Applied to the admin feedback queue (`longDate`/`shortDate`), which showed host-zone times. Bubbles' own default was
already America/Chicago. The review-sync chat line already says "(Central time)". Sunny-only parts (agent loop, Salon
Performance panel, L10 panel) do not exist here.
