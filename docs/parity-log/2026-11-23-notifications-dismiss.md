# Notifications: × removes one, Clear all removes every one, for the viewer only (23 Nov 2026, Pau via QA)

**Sibling app: to port.** Ask Sunny has the same bell and `app_notifications` table (this app's is a port of it). The
port goes through coder 3, who pushes to ask-sunny.

Pau: "able to delete notification all or clicking x by removing 1". The bell's panel (`features/notifications/
notifications-panel.tsx`, one component for every bell) has an × on each row and Clear all beside Mark all as read.
Clicking a row still opens its form; the × never does. The list and the unread badge change at once, before the server
answers.

How it is hidden: a delete of the viewer's own rows. Each `app_notifications` row is one recipient's own copy
(`recipient_email`), nothing else reads the table (the HR approval only writes to it), and RLS gives browsers no access.
`dismissNotifications` always filters on the caller's email, so another person's id matches no row. The action takes the
email from the signed-in identity, never from the browser. No form or approval record is read or changed. No migration.

Tests: `lib/notifications/dismiss.test.ts` covers dismissing one, Clear all, never someone else's, no form touched,
signed out and bad ids. `features/notifications/notification-bell.dom.test.tsx` covers the × not opening, the count
dropping at once, Clear all, and a row still opening.

## The DM L10 bell shows the same panel (Pau: "for dm meeting make this UI same with bubble")

The DM L10 bell (`features/l10/ui/NotificationBell.tsx`, `features/l10/notifications/NotificationsView.tsx`) now shows
Ask Bubbles' own `NotificationsPanel` in the app's popover style. Mark all read and See all are kept. The out-of-app
"Settings" link (it opened the Leadership Hub, where Pau landed on its board) is removed; Ask Bubbles has no per-person
notification settings. The meta line ("<meeting> · 6 d ago") has normal contrast. There is no × or Clear all on these
notes: they live in the Leadership Hub's database, which has no dismiss function; the Hub needs a dismiss RPC for them.
Security check (QA's item A): the Hub's own server-side gate already keeps a meetings-only person off its board pages and
APIs, and its production has HUB_AUTH=required (QA checked); nothing in the Hub repository was changed.
