# Calendar: this app's code names no other company (Bubbles only)

**Date:** 26 Nov 2026 · **PR:** Ask Bubbles #1178 (the Calendar, ported from Ask Sunny #1353)

The tenant-isolation test (`src/lib/knowledge-sync/woven/bcs/tenant-isolation.test.ts`, test 12) refuses any
production module that names the sister company or its app. The ported calendar named it in a source label
(`SOURCE_LABELS["ask-sunny"]`), a failure note and a few comments. Here they read "the sibling app"; the source id
`ask-sunny` in the shared event contract stays (it is an id, not a name, and the test allows it). This app never
shows the sibling app's events (`/api/partner/calendar` and the merge both drop them), so the label is never seen.

**Not ported to Ask Sunny:** Sunny has no such rule, and its calendar's labels name the Leadership Hub and Ask
Bubbles on purpose (the shared contract file, `src/lib/calendar/types.ts`).
