## 15 Nov 2026: DM L10 Segue icebreaker question shows its save status

Port from Ask Sunny #1048 and Leadership Hub #99 (`2dc4a6a`). The owner thought the Segue's question box was not
saving: it was, but nothing on the page said so. The box is now labelled with Bloom Growth's wording, "THIS WEEK'S
ICEBREAKER QUESTION" (placeholder "Add this week's icebreaker question…"), and shows the page's save status under it
in an `aria-live` line, except when the page is read-only. The stored key (`segueQuestion`) is unchanged.
`BloomSections.tsx` and `MeetingView.tsx` are copied as they are.

Sibling app: already in Ask Sunny (#1048); this is its port.
