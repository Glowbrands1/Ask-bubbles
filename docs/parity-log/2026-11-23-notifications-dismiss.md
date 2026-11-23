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
