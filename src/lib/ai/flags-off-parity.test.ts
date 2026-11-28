import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_ON } from "@/lib/config/default-on";

import { CHAT_QUALITY_FLAG_NAMES, antiLoopEnabled, envFlag } from "@/lib/config/chat-quality-flags";
import { cardChangeEnabled, cardChangeFinalizedEnabled } from "@/lib/forms/card-change-flag";

/**
 * Flags off must match the path the suites already expect.
 *
 * Every name in CHAT_QUALITY_FLAG_NAMES defaults off, including
 * ANTI_LOOP_ENABLED. The chat and form suites run again in a child
 * process with each of those names forced off. A failure there is a
 * behavior change that leaked through while the flags were off.
 *
 * The close-match note under the form card is the one UI file this
 * branch changes. It renders nothing unless the proposal sets the note.
 */

const PROTECTED = [
  "src/lib/ai/form-proposal.ts",
  "src/lib/ai/violation-policy.ts",
  "src/lib/ai/prior-coaching-optional.ts",
  "src/lib/ai/glossary.ts",
  "src/lib/ai/form-field-state.ts",
  "src/lib/ai/chat-data-plan.ts",
  "src/lib/forms/location-scope.ts",
  "src/lib/forms/proposal.ts",
  "src/lib/forms/form-date-answer.ts",
  "src/lib/forms/payroll-deduct.ts",
  "src/lib/forms/ca-action-plan.ts",
  "src/lib/forms/required-closing.ts",
  "src/lib/forms/chat-revision.ts",
  "src/lib/forms/revision.ts",
  "src/lib/forms/policy-citation.ts",
  "src/lib/forms/instances.ts",
];

/*
 * The user (Pau) approved, via QA on 25 Oct 2026, editing
 * src/lib/forms/form-date-answer.ts to fix prior-action parsing behind
 * PRIOR_ACTIONS_PARSE_ENABLED, with the flag-off reading unchanged. It stays
 * on the PROTECTED list; only the diff check leaves it out.
 *
 * The user (Pau) approved, on 26 Oct 2026, editing src/lib/ai/form-proposal.ts
 * for STORED_SLOTS_NOT_A_REQUEST_ENABLED: in turnsAboutThisForm the new-request
 * check reads the manager's words, not the app's stored-slot lines, with the
 * flag-off reading unchanged. It stays on the PROTECTED list; only the diff
 * check leaves it out. No other protected file is excepted.
 * PRIOR_ACTIONS_PARSE_ENABLED, with the flag-off reading unchanged, and on
 * 26 Oct 2026 again for the incident date behind PRIOR_SENTENCE_FIX_ENABLED
 * (a prior step's date is never the form's Date). It stays
 * on the PROTECTED list; only the diff check leaves it out. No other
 * protected file is excepted.
 *
 * The user (Pau) approved, in the Code session on 27 Oct 2026 ("yes, name
 * question form-proposal.ts both apps"), two lines in src/lib/ai/form-proposal.ts
 * openingQuestions behind NAME_QUESTION_ONLY_ENABLED: with no employee named,
 * one plain question instead of the list. Off, the list as before.
 *
 * The user (Pau) approved, in the Code session on 27 Oct 2026, editing
 * src/lib/forms/proposal.ts, only two lines, for the Madeline chain (QA BF7):
 * the import of `namesSomebody` from "./answer-not-a-name", and in
 * readEmployeeMentions `settle(strong.filter(namesSomebody),
 * found.filter(namesSomebody), text, subjects)`. Behind
 * ANSWER_NOT_A_NAME_ENABLED and STORE_WORD_NOT_A_NAME_ENABLED, both default
 * off; off, namesSomebody keeps every candidate. It stays on the PROTECTED
 * list; only the diff check leaves it out.
 *
 * The user (Pau) approved, via QA on 29 Oct 2026 ("yes do that please"),
 * two more lines in src/lib/forms/proposal.ts, both apps: the import
 * `import { isExitTerms, namesSomebody } from "./answer-not-a-name";` and in
 * employeeState `reading.names.filter((name) => !excluded.some((not) =>
 * samePerson(not, name)) && !isExitTerms(name))`. Behind
 * EXIT_TERMS_NOT_NAMES_ENABLED, default off; off, isExitTerms is false and
 * every name is kept.
 *
 * The user (Pau) approved, via QA on 29 Oct 2026 ("ok address line"), the
 * same two lines again in src/lib/forms/proposal.ts, both apps: the import
 * `import { isExitTerms, namesSomebody, notInStreetAddress } from
 * "./answer-not-a-name";` and in employeeState `… && !isExitTerms(name) &&
 * notInStreetAddress(message.content)(name)`. Behind
 * STREET_ADDRESS_NOT_A_NAME_ENABLED, default off; off, notInStreetAddress
 * keeps every name.
 *
 * The user (Pau) approved, in the Code session on 27 Oct 2026, editing
 * src/lib/forms/form-date-answer.ts in both apps, only two lines: the import
 * of `withWiderDates` from "./wider-dates", and datesInText's last line
 * `return withWiderDates(text ?? "", today, found);`. Behind
 * WIDER_DATE_READER_ENABLED, default off; off, the dates found are returned
 * as they were. form-date-answer.ts is already excluded from the diff check.
 *
 * The user (Pau) approved in writing, via QA on 31 Oct 2026 ("Approve both"),
 * in src/lib/forms/chat-revision.ts, both apps: the import
 * `import { revisionSameValueEnabled } from "@/lib/config/chat-quality-flags";`
 * and, before `const changed`, a value equal to the field's current text is
 * dropped from `byName.values`. Behind REVISION_SAME_VALUE_ENABLED, default
 * off; off, nothing is dropped.
 *
 * The user (Pau) approved in the Code session on 3 Nov 2026 ("Approve chat
 * revisions"), in src/lib/forms/chat-revision.ts, both apps: the import
 * `import { namesOnRoster } from "./roster-name-gate";` and the existing
 * `const named = extractEmployeeNames(...).filter(...)` wrapped as
 * `await namesOnRoster(<the same filtered list>, actor.scope)`. Behind
 * FORM_EDIT_NAME_GATE_ROSTER_ENABLED, default off; off, namesOnRoster returns
 * the list unchanged and reads nothing.
 *
 * The user (Pau) approved on 4 Nov 2026, via QA ("chat-revision.ts hunk 1,
 * version 2: YES, same hunk in both apps"), in src/lib/forms/chat-revision.ts:
 * the import `formEditSingleWriterEnabled` beside `revisionSameValueEnabled`,
 * and the revision's save as `formEditSingleWriterEnabled() ?
 * writeRevisionEdits(…, { actorId, latest: input.question, notes }) :
 * applyAssistantRevision(…)`. Behind FORM_EDIT_SINGLE_WRITER_ENABLED, default
 * off; off, the same applyAssistantRevision call as before.
 *
 * The user (Pau) approved on 4 Nov 2026 ("#424: Option A approved"), in
 * src/lib/forms/instances.ts, `reviseInstance`: the imports
 * `offeredOffenseKeys` (./offense-keys) and `caSalesPolicyEnabled`, and one
 * block after `const byKey`: only when the revision lands on a NEWER version,
 * a Type of Offense tick on a box Corrective Action revision 7 replaced is
 * carried as the box that replaced it, and an old Other write-in ticks Other.
 * Behind CA_SALES_POLICY_ENABLED, default off; off, every row is carried as
 * before. The filed form is never touched.
 *
 * The user (Pau) approved on 10 Nov 2026, via QA ("ok revision archived"), in
 * src/lib/forms/instances.ts, both apps, exactly the lines of
 * docs/patches/revision-archived-not-open.patch: the import
 * `revisionArchivedNotOpenEnabled` beside `caSalesPolicyEnabled`, and in
 * findOpenRevision the draft query split so that, behind
 * REVISION_ARCHIVED_NOT_OPEN_ENABLED (default off), `.is("archived_at", null)`
 * leaves archived drafts out. Off, the same query as before. instances.ts is
 * already excluded; the narrowed index migration is applied in both DBs.
 *
 * The user (Pau) approved in writing on 10 Nov 2026, via QA ("ok termination
 * closing"), behind TERMINATION_STATED_TICKS_ENABLED (default off), both apps:
 * in src/lib/forms/required-closing.ts, `withRequiredClosing` returns a value
 * that already ends with the termination sentence unchanged (with its
 * `TERMINATION_PLAN_CLOSING` constant and the flag import); in
 * src/lib/forms/ca-action-plan.ts, `ActionPlanInput.termination`, and a
 * Termination plan's closing is the termination sentence (`planClosing`, also
 * in `refreshedActionPlan`). Off, both are exactly as before; instances.ts is
 * not touched.
 *
 * The user (Pau), under the standing approval, via QA on 14 Nov 2026, behind FUZZY_STORE_ASKS_ENABLED (default off):
 * in src/lib/forms/location-scope.ts, fromNamedLocations does not take a single store read by a close spelling more
 * than one letter off (a `loose` mention) silently under GLOBAL_STORE_ASK; it is asked. The flag import and that one
 * condition; docs/patches/fuzzy-store-asks.patch. Off, exactly as before.
 *
 * Under Pau's standing approval for protected-file edits (relayed by QA, 14 Nov 2026, for the OTHER_* port to this
 * app), in src/lib/forms/ca-action-plan.ts, exactly the lines of docs/patches/other-not-a-policy-name.patch: the import
 * `otherNotAPolicyNameEnabled`, and in policyNamesFromViolated a Policy Violated label "Other" names no policy. Behind
 * OTHER_NOT_A_POLICY_NAME_ENABLED (default off); off, the names are read as before. ca-action-plan.ts is already
 * excluded below.
 *
 * The user (Pau) approved, under Pau's standing approval via QA, 11 Nov 2026, in
 * src/lib/ai/form-proposal.ts, exactly: the import
 * `import { cardAccountText } from "@/lib/forms/account-spelling";` and the
 * card's Issue line wrapped as
 * `stated.push(`**Issue:** ${cardAccountText(proposal.issue, proposal.employeeName)}`)`
 * with its comment (port from Ask Sunny b206494f: the card's account keeps the
 * manager's words with obvious slips mended). Behind ACCOUNT_TYPOS_FIXED_ENABLED,
 * default off; off, cardAccountText returns its input and the card is as before.
 *
 * Under Pau's standing approval for protected-file edits (relayed by QA, 14 Nov 2026, for Gate-Bubbles-5's #892
 * probes, QA's ruling (b)), in src/lib/ai/form-proposal.ts, exactly the lines of
 * docs/patches/other-beside-described-form-proposal.patch: the import `withoutCleaningDuty`, and at the start of
 * namedPolicyFor a cleaning duty beside a second described offense reads that offense from the account without the duty
 * (marked `besideOther`). Behind OTHER_POLICY_AGREES_ENABLED (default off here); off, as before. form-proposal.ts is
 * already excluded below.
 */
const APPROVED_PROTECTED_EDITS = [
  ":(exclude)src/lib/forms/location-scope.ts",
  ":(exclude)src/lib/forms/required-closing.ts",
  ":(exclude)src/lib/forms/ca-action-plan.ts",
  ":(exclude)src/lib/forms/chat-revision.ts",
  ":(exclude)src/lib/forms/instances.ts",
  ":(exclude)src/lib/forms/form-date-answer.ts",
  ":(exclude)src/lib/ai/form-proposal.ts",
  ":(exclude)src/lib/forms/proposal.ts",
];

const UI_PATHS = ["src/app/**/*.tsx", "src/components/**", "src/features/**/*.tsx", "**/*.css"];
/*
 * The UI files this branch may change. The composer was added with QA's
 * approval on 25 Oct 2026: behind CHAT_LONG_MESSAGE_ENABLED, a
 * character-count line under the field and send disabled over the limit.
 * Off, it renders as before.
 */
/*
 * And the Forms Register links an Assistant Manager would meet (chat card
 * button, search and its hook): QA approved on 27 Oct 2026, behind
 * NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED. Each gate reads the flag first;
 * off, it renders as before for every role.
 */
const ALLOWED_UI = [
  /*
   * DM L10 tab (the Leadership Hub's BCS DM L10, as Ask Sunny's tab; QA, 15 Nov 2026): new pages and components only,
   * shown only when HUB_PARTNER_SECRET is set and the Leadership Hub says the person holds the meeting's role. The
   * stylesheet gains a section scoped to `.hub-l10` (plus colour names this app does not use). No existing page, chat
   * or form behaviour changes. The shell files it touches (sidebar, app-shell, the (app) layout) are listed below.
   */
  "src/app/(app)/meetings/",
  "src/features/l10/",
  "src/app/globals.css",
  // AI TRAINING tab (requested by Paulyne, 18 Nov 2026, both apps): the AI Training app rebuilt as new pages and
  // components, with its own tables and permission. No existing page, chat or form behaviour changes. The stylesheet
  // gains a section scoped to `.training-prose` and `.training-callout-*`.
  "src/app/(app)/ai-training/",
  "src/features/ai-training/",
  // WHAT'S NEW and the AI-READABLE PAGES list (Paulyne, 26 Nov 2026, both apps; QA, 24 Nov 2026, could not find the list
  // of pages the AI can read): two new pages and their screens only, with one rail entry each (navigation.ts, listed
  // below). Read-only lists from typed config; no existing page, chat or form behaviour changes, no flag involved.
  "src/app/(app)/whats-new/",
  "src/features/whats-new/",
  "src/app/(app)/admin/ai-readable-pages/",
  "src/features/admin/ai-readable-pages-screen.tsx",
  // IN-APP BELL (Pau, 23 Nov 2026: "port the notification bell to Bubbles", for the HR form approval; port from Ask
  // Sunny 30cac4c): a new bell component and its mark-read action. It renders only for someone with a notification:
  // in the rail on desktop (sidebar.tsx), in the top bar on phones (app-shell.tsx), read by the (app) layout; all
  // three are listed below. No chat or form behaviour changes.
  "src/features/notifications/",
  // ...and its × per row and Clear all (Pau, 23 Nov 2026: "able to delete notification all or clicking x by removing 1"):
  // the viewer's own notifications only. The DM L10 bell (src/features/l10/, listed above) shows the same panel (Pau:
  // "for dm meeting make this UI same with bubble"), with its out-of-app Settings link removed.
  // HR APPROVAL OF FORMS (owner request, 23 Nov 2026, both apps), behind FORMS_HR_APPROVAL_ENABLED (off): the form card's
  // "Finalize and send for approval" and HR's approval panel, the Forms Register's Pending HR approval tab and "Your
  // forms with HR" list, the Overview card, and the HR review page. Off, none of them renders and Finalize is as before.
  "src/features/forms/hr-approval-lists.tsx",
  // BLANK FIELDS OUTLINED ON THE FORM (Pau, 25 Nov 2026, both apps; port from Ask Sunny: "add a pop up that there are
  // missing fields and highlight it in both apps"): ResponsiveForm's `missing` prop outlines the fields Finalize refused
  // as blank; the pop-up is in inline-form.tsx (listed below). Only after a refusal for blank fields; otherwise every
  // field renders as before.
  "src/features/forms/document/responsive-form.tsx",
  // "Show address" on the Employee Directory (Pau, 26 Nov 2026: "can we list their address here"; admins only, nothing
  // saved): a Home address column whose button asks Woven for one person's address on click. Admin page only.
  "src/features/admin/woven/directory-table.tsx",
  "src/features/admin/woven/address-button.tsx",
  // THE CALENDAR (Pau, 26 Nov 2026, both apps: one calendar with the Leadership Hub, "+ New event" and the chat's
  // reminder card): a new page and its own components, reached only from the new Calendar entry. No existing screen
  // changes; the chat bubble mounts the reminder card only when an answer carries one.
  "src/app/(app)/calendar/page.tsx",
  // ANALYTICS BY AREA AND BY PERSON (Pau, 28 Nov 2026, both apps: "add usage for the L10 all meetings and the form
  // monitoring as well pls, and list all users per name ... not just by title", "also add ai training", "add google
  // reviews too and calendar"): the admin Analytics page gains "Usage by person" and the area split, and the Google
  // Reviews page records a day of use after it is sent (as L10, Forms Register, AI Training and Calendar do, already
  // listed). Nothing rendered changes on the Reviews page; no chat or form behaviour changes, no flag involved.
  "src/app/(app)/reviews/page.tsx",
  "src/features/admin/analytics/analytics-screen.tsx",
  "src/features/admin/analytics/tables.tsx",
  "src/features/calendar/calendar-view.tsx",
  "src/features/calendar/new-event.tsx",
  "src/features/calendar/reminder-card.tsx",
  // WHO OWNS A FORM'S FOLLOW-UP (the owner, 27 Nov 2026, approved "ok to all"; port from Ask Sunny): the owner control
  // under a follow-up date in the Forms Register's row and on the form. Shown only on a form with an open follow-up; it
  // reads and writes through its own route, whose checks decide. No chat behaviour changes.
  "src/features/forms/follow-up-owner-picker.tsx",
  // THE FLOATING CALENDAR (port from the sibling app; the owner, 27 Nov 2026: "can we make the calendar pop up and be
  // resizable so anytime we go in other tabs it stays there"): a launcher button and a window over the app, mounted in the
  // layout, showing the Calendar page's own view. No chat or form behaviour changes.
  "src/features/calendar/calendar-popup.tsx",
  // The named account sees every address without clicking (Pau, 26 Nov 2026: "for my access only"; WOVEN_ADDRESS_LIST_EMAILS):
  // the Woven page passes the yes/no down to the directory. Admin page only.
  "src/app/(app)/admin/integrations/woven/[view]/page.tsx",
  "src/features/admin/woven/woven-view-screen.tsx",
  "src/features/forms/hr-approval-panel.tsx",
  "src/features/forms/hr-approval-screen.tsx",
  "src/app/(app)/forms/hr-approval/",
  "src/features/dashboard/overview.tsx",
  // Then (Pau, via QA, 23 Nov 2026, QA approved, both apps; #1115, the same as Ask Sunny #1288): "when manager replies in
  // note, there should be approve button here please and notify manager ... then the manager once sent back, will have
  // option to print and save as PDF" — the panel's Approve and Send back after the manager's reply (hr-approval-panel.tsx),
  // HR's "Needs your decision" list (hr-approval-lists.tsx), and the card's Print beside Download PDF (inline-form.tsx,
  // listed below); "its so small pending approval, make it red button and animated shaking if theres a pending" — the
  // Pending HR approval button (hr-approval-lists.tsx) and its .hr-pending-shake in globals.css (listed above), off under
  // reduced motion; and the sibling app's approvals on the Forms Register (monitoring/page.tsx, listed below), first a
  // "Sunny approvals ↗" link, then (owner: "i dont want the sunny approval in a different page and link, just a tab pls")
  // an in-page tab next to Pending HR approval, for HR approvers only. The approval UI is behind FORMS_HR_APPROVAL_ENABLED: off, the server sends no approval data, so none of
  // it renders. Print shows on any finalized form and opens the same server PDF as Download PDF.
  "src/features/forms/hr-approval-manager-replied.dom.test.tsx",
  // ...and its one sidebar entry, with the rail tests that list what an Employee sees.
  "src/components/shell/navigation.ts",
  "src/components/shell/navigation.test.ts",
  // NEXT_PUBLIC_REPLY_QUOTE_LINES_ENABLED (#839, QA's Bubbles 17p live check; QA round 17r, 13 Nov 2026): a run of "> "
  // lines in a reply is shown as a quote, a line each. Off, the renderer is unchanged.
  "src/components/rich-text.tsx",
  /*
   * FORM_EDIT_SOURCE_TURN_ENABLED (coding 3, item 1, accepted design 5 Nov
   * 2026): the answer's `formReply` is kept on the message it already builds,
   * so it goes back with the history. Data only: nothing renders differently,
   * and with the flag off the server never sends one.
   */
  "src/features/chat/chat-screen.tsx",
  // Import's "couldn't confirm … is yours" line (QA, 12 Nov 2026, both apps): shown only for a "not_proven" decline,
  // which only CHAT_IMPORT_PROVEN_OWN_ENABLED returns. Off, the server never declines that way, so it never shows.
  "src/features/chat/import-local-history.tsx",
  // District Manager, 3 Nov 2026 (QA approved 5 Nov, Pau 6 Nov): the Reviews page and the admin Google Reviews
  // screen show the company's store number (Dawley Farms: 309; its Google code 338 stays the match key). Unflagged:
  // it is a data correction, identical for every store whose number is its code.
  "src/features/reviews/reviews-data.tsx",
  "src/features/admin/google-reviews/google-reviews-screen.tsx",
  // STORE LEADERBOARD PERIOD (Pau, 23 Nov 2026: "pls do in bubbles too but pls add the per month for both like September
  // october november"): the Reviews page's leaderboard picker offers L3, L6 and YTD beside the months, and the board's
  // header and column follow it. Reviews page only, unflagged like the store-number fix above: no chat or form behaviour.
  "src/features/reviews/reviews-dashboard.tsx",
  "src/features/reviews/reviews-parts.tsx",
  // PERMISSIONS MATRIX SAVED TO THE DATABASE (Pau, 23 Nov 2026, both apps; port from Ask Sunny 8376613): the admin
  // Permissions matrix screen saves its overrides through PUT /api/admin/permissions instead of showing a read-only
  // policy. Admin screen only; no chat or form behaviour changes.
  "src/features/admin/permissions-matrix.tsx",
  "src/features/chat/message-bubble.tsx",
  "src/features/chat/composer.tsx",
  // PHONE DENSITY (the owner, 27 Nov 2026: "can u compact the apps in phone view pls eveyrthing is too large"; port of
  // Ask Sunny 1d93d6c): the page frame and page titles take tighter gutters and a 22px title below 640px only. Every
  // class from `sm` up is unchanged, so desktop renders as before; no chat, form or AI behaviour changes.
  "src/components/ui/layout.tsx",
  "src/features/chat/inline-form.tsx",
  // The exit form's notice dates (Pau, 25 Nov 2026: "dates can NOT be entered into the Date that notice was given and
  // Date that notice was fulfilled fields UNLESS Submitted & Fulfilled Notice box is checked"; port from Ask Sunny): the
  // form card greys the two dates out with a note until that box is ticked. Exit form only; every other field as before.
  "src/features/forms/document/responsive-form.tsx",
  "src/components/shell/global-search.tsx",
  "src/components/shell/hides-form-monitoring.ts",
  // App switcher gains a Leadership Hub link, shown only when the server says the signed-in
  // email is on LEADERSHIP_HUB_TAB_EMAILS (requested via the QA session, Nov 2026 — QA to confirm).
  // Unset, the switcher renders exactly as before.
  "src/components/shell/app-switcher.tsx",
  "src/components/shell/sidebar.tsx",
  "src/components/shell/app-shell.tsx",
  // Once-a-day "we're updating the chat" notice (Pau, 18 Nov 2026, both apps): a dialog on desktop and a banner on
  // phones, dismissed per user per business day. Shell only; no chat or form behaviour changes.
  "src/components/shell/update-notice.tsx",
  // PRIVATE_CREATOR_FORMS_ENABLED (QA approved 27 Oct 2026): the follow-up and list reads over-read and trim to
  // their page while the rule is active; off, each asks for its page exactly as before.
  "src/app/(app)/page.tsx",
  "src/app/(app)/layout.tsx",
  "src/app/(app)/forms/monitoring/page.tsx",
  // QA-approved 2026-10-27 (owner asked for the Change something button), behind
  // NEXT_PUBLIC_CARD_CHANGE_ENABLED; off, it renders nothing.
  "src/features/chat/card-change-panel.tsx",
  // QA-approved 2026-10-28 (Pau: structured changes on a finalized form), behind
  // NEXT_PUBLIC_CARD_CHANGE_FINALIZED_ENABLED; off, it renders nothing.
  "src/features/chat/finalized-change-panel.tsx",
  // INVITE_LINK_HOLD_ENABLED (QA approved 28 Oct 2026, both apps): the new invitation
  // Continue page and its form. Off, the page never shows Continue.
  "src/app/auth/invite-continue/page.tsx",
  "src/features/auth/invite-continue-form.tsx",
  // Public /about and /privacy for Google's OAuth consent screen; no chat or form
  // behavior; requested by Pau (1 Nov 2026). Two new pages, their shared frame, and the
  // About / Privacy links under the sign-in form. login-screen.tsx is listed as a whole
  // file, so later edits to it are not checked by this guard.
  "src/app/about/page.tsx",
  "src/app/privacy/page.tsx",
  "src/features/public/public-page.tsx",
  "src/features/auth/login-screen.tsx",
  /*
   * VOICE INPUT (the owner, 27 Nov 2026, VOICE_INPUT_ENABLED, default off, plus the VOICE_INPUT_USERS pilot list): one
   * shared mic component (src/features/voice/) in every AI chat box — the composer, chat-screen, the (app) layout and the
   * L10 assistant are listed above; the Overview ask band and the report ask bar are below. Off, or for anyone not on the
   * list, `VoiceControl` renders its children only and the boxes render and send exactly as before.
   */
  "src/features/voice/",
  "src/features/dashboard/ask-band.tsx",
  "src/features/reports/ask-about-report.tsx",
  /*
   * WOVEN AUTO-DISABLE OF TERMINATED ACCOUNTS (owner, 28 Nov 2026: "make this automatic for both sunny and bubble"):
   * the admin-only Access Preview tab names the new `apply` access mode in its read-only notice (one prop type and one
   * label). Admin page only; no chat or form behaviour changes. WOVEN_ACCESS_MODE unset or "shadow", it reads as before.
   */
  "src/features/admin/woven/access-preview.tsx",
  /*
   * WHAT'S NEW BADGES AND RED NOTES (Pau, 28 Nov 2026, both apps: "add a bubble HR ONLY in red", "make a note and
   * highlight in red"): the page draws an entry's optional audience badge and note, and hides Before when an entry has
   * none. What's New page only; no chat or form behaviour changes.
   * A PAGE THE ANSWER NAMES IS A LINK (Pau, 28 Nov 2026, both apps: "make sure if sunny or bubble direct them to a page,
   * make sure its clickable"): RichText (listed above) links a page's name, or a [label](/path) to it, only when the page
   * is one this person's own sidebar shows (`src/lib/navigation/page-links.ts`); the chat bubble (above) and the Home
   * answer sheet pass the person's pages. Without them RichText renders as before. Display only: answers do not change.
   */
  "src/features/whats-new/whats-new-screen.tsx",
  "src/features/dashboard/answer-sheet.tsx",
];

/*
 * The user (Pau) approved, via QA on 25 Oct 2026, the forms list's Edit and
 * History mount for form revisions in both apps: exactly these two added
 * lines in monitoring-table.tsx, rendering nothing with
 * NEXT_PUBLIC_FORM_REVISIONS_ENABLED off (and, 29 Oct 2026, the row menu "…" shows only when it has an item). The file is
 * since held to the revision mount and to no archiving: see the check in the test below.
 */
const MONITORING_TABLE = "src/features/forms/monitoring-table.tsx";

/*
 * NEXT_PUBLIC_INVITED_SIGNIN_ACCEPTS_ENABLED (QA approved 28 Oct 2026, both
 * apps; QA reviews the auth diff line by line): sign-in-form.tsx may add
 * exactly the flag import and the gated accept call, plus comment lines.
 * Off, the form behaves as before. Any other change to the file fails.
 */
const SIGN_IN_FORM = "src/features/auth/sign-in-form.tsx";
const SIGN_IN_ACCEPT = [
  '+import { invitedSignInAcceptsEnabled } from "@/lib/auth/invited-signin-flag";',
  "+      if (invitedSignInAcceptsEnabled()) {",
  '+        await fetch("/api/auth/accept-invitation", { method: "POST" }).catch(() => undefined);',
  "+      }",
];
const isAddedCommentOrBlank = (line: string) => /^\+\s*(\/\*.*|\*.*|)$/.test(line);

function changedLines(patch: string): string[] {
  return patch.split("\n").filter((line) => /^[+-](?![+-]{2} )/.test(line));
}

function diff(ref: string, args: string[], cwd: string = process.cwd()): string {
  return execFileSync("git", ["diff", ref, "--", ...args], { encoding: "utf8", cwd });
}

function hasRef(ref: string, cwd: string = process.cwd()): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "pipe", cwd });
    return true;
  } catch {
    return false;
  }
}

function mergeBase(a: string, b: string, cwd: string): string | null {
  try {
    return execFileSync("git", ["merge-base", a, b], { encoding: "utf8", stdio: "pipe", cwd }).trim() || null;
  } catch {
    return null;
  }
}

function quietFetch(args: string[], cwd: string): void {
  try {
    execFileSync("git", ["fetch", ...args], { stdio: "pipe", timeout: 30_000, cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  } catch {
    // The remote cannot give it. The caller falls back.
  }
}

/**
 * CHANGED ON PURPOSE (port of the sibling app's guard fix, QA, 23 Nov 2026): the UI diff is taken from this branch's
 * MERGE BASE with main, so it checks only this pull request's own changes. It used the live `origin/main`: in the
 * sibling app, whose CI fetches main, every open pull request went red when main moved during a run (a UI file main
 * added read as deleted by branches that never touched it). Here the Actions checkout is a single commit and main was
 * never fetched, so the UI diff was skipped in CI altogether; it now fetches main with some history (and deepens HEAD
 * if the merge base is still unknown), so the check runs in CI, on this pull request's own changes only. Without any
 * merge base, the old reference is used. Null means this checkout cannot see main at all: the UI diff is skipped.
 */
function uiDiffBase(cwd: string = process.cwd()): string | null {
  if (!hasRef("origin/main", cwd)) quietFetch(["--depth=200", "origin", "main:refs/remotes/origin/main"], cwd);
  if (hasRef("origin/main", cwd)) {
    const base = mergeBase("HEAD", "origin/main", cwd);
    if (base) return base;
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd }).trim();
    quietFetch(["--depth=200", "origin", head], cwd);
    quietFetch(["--deepen=200", "origin", "main:refs/remotes/origin/main"], cwd);
    return mergeBase("HEAD", "origin/main", cwd) ?? "origin/main";
  }
  if (!hasRef("main", cwd)) return null;
  return mergeBase("HEAD", "main", cwd);
}

describe("the UI diff checks only this branch's own changes (CHANGED ON PURPOSE, port of the sibling app's guard fix, QA, 23 Nov 2026)", () => {
  /* A throwaway repository: main gains a UI file after the branch was cut (as the sibling app's main did during a run). */
  function repo(): { dir: string; git: (...args: string[]) => string } {
    const dir = mkdtempSync(join(tmpdir(), "ui-diff-base-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", cwd: dir, stdio: "pipe" });
    git("init", "-q");
    writeFileSync(join(dir, "ui.tsx"), "export const A = 1;\n");
    writeFileSync(join(dir, "lib.ts"), "export const x = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "feature");
    writeFileSync(join(dir, "lib.ts"), "export const x = 2;\n");
    git("commit", "-q", "-am", "the branch's own change, no UI file");
    git("checkout", "-q", "main");
    writeFileSync(join(dir, "new-ui.tsx"), "export const B = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "main moves on: a new UI file");
    git("update-ref", "refs/remotes/origin/main", "main");
    git("checkout", "-q", "feature");
    return { dir, git };
  }

  it("a UI file added only on main does not trip it", () => {
    const { dir } = repo();
    try {
      const base = uiDiffBase(dir);
      expect(base).not.toBeNull();
      expect(diff(base!, ["new-ui.tsx", "ui.tsx"], dir)).toBe("");
      // The old reference (the live origin/main) read main's new file as deleted by this branch.
      expect(diff("origin/main", ["new-ui.tsx"], dir)).not.toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a branch that edits a UI file itself still trips it", () => {
    const { dir, git } = repo();
    try {
      writeFileSync(join(dir, "ui.tsx"), "export const A = 2;\n");
      git("commit", "-q", "-am", "the branch edits a UI file");
      expect(diff(uiDiffBase(dir)!, ["ui.tsx"], dir)).not.toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("new flags default off", () => {
  it("treats unset flags as off, including the anti-loop flag", () => {
    const previous = Object.fromEntries(CHAT_QUALITY_FLAG_NAMES.map((name) => [name, process.env[name]]));
    for (const name of CHAT_QUALITY_FLAG_NAMES) delete process.env[name];
    // Since 3 Nov 2026 ("(E) batch 1", config/default-on.ts) the flags in DEFAULT_ON read as on when unset; every other flag, off.
    for (const name of CHAT_QUALITY_FLAG_NAMES) expect(envFlag(name), name).toBe(DEFAULT_ON.has(name));
    // ...and "off" still turns each of them off (the emergency off switch).
    for (const name of DEFAULT_ON) {
      process.env[name] = "off";
      expect(envFlag(name), name).toBe(false);
      delete process.env[name];
    }
    expect(antiLoopEnabled()).toBe(false);
    expect(cardChangeEnabled()).toBe(false);
    expect(cardChangeFinalizedEnabled()).toBe(false);
    for (const name of CHAT_QUALITY_FLAG_NAMES) {
      const saved = previous[name];
      if (saved === undefined) delete process.env[name];
      else process.env[name] = saved;
    }
  });

  it("does not edit the protected modules, and the only UI diffs are the close-match note and the composer's length line", () => {
    expect(diff("HEAD", [...PROTECTED, ...APPROVED_PROTECTED_EDITS])).toBe("");
    const uiBase = uiDiffBase();
    if (uiBase) {
      const raw = diff(uiBase, [...UI_PATHS, ":(exclude)**/*.test.tsx", ":(exclude)**/*.dom.test.tsx"]);
      const unexpected = raw
        .split(/(?=^diff --git )/m)
        .filter((block) => block.trim().length > 0 && !ALLOWED_UI.some((file) => block.includes(file)) && !block.includes(MONITORING_TABLE) && !block.includes(SIGN_IN_FORM))
        .join("");
      expect(unexpected).toBe("");
      // CHANGED ON PURPOSE (Pau, 23 Nov 2026, archiving removed; port from Ask Sunny 8376613 and daf6fc8): forms are
      // Draft or Finalized only, so monitoring-table.tsx loses its Archived shelf and Archive / Restore actions and
      // gains the select-several-drafts bulk delete. That is hundreds of lines, so the file is no longer held to the two
      // mount lines above; instead the check below still requires the revision mount to be there and the file to say
      // nothing about archiving, so the Edit / History mount (NEXT_PUBLIC_FORM_REVISIONS_ENABLED) is not lost.
      const table = readFileSync(MONITORING_TABLE, "utf8");
      expect(table).toContain("<RegisterRowActions form={form} />");
      expect(table).not.toMatch(/ArchiveRestore|archivedAt|kind: "archive"/);
      expect(
        changedLines(diff(uiBase, [SIGN_IN_FORM])).filter((line) => !SIGN_IN_ACCEPT.includes(line) && !isAddedCommentOrBlank(line)),
      ).toEqual([]);
    }
    const ask = readFileSync("src/lib/ai/server-ask.ts", "utf8");
    const code = ask.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("process.env");
    expect(code).not.toContain(".catch(");
    expect(ask).toContain("question: request.question");
    expect(ask).toContain("slotRetentionEnabled()");
  }, 60_000);
});

const CHILD = process.env.FLAGS_OFF_PARITY_CHILD === "1";

/*
 * The child run is split in five (ported from the sibling app, QA, 7 Nov 2026): src/lib; src/app/api/chat
 * without the replay pack, in two halves by name; src/app/api/forms; the replay pack. As one run over all four folders it timed out
 * (ETIMEDOUT at 540 s) on busy runners, and in the sibling app the chat+forms part alone had reached 530 s on
 * main on a 4-CPU runner. Measured here with three children (4-CPU): src/lib 101 s, chat without the pack +
 * forms 250 s, the replay pack 116 s. Each child has the whole budget with room to spare. The folders, the flags and what must pass are
 * unchanged, and every test file still runs in exactly one child.
 *
 * A path filter matches any file whose path contains it, so the chat folder without the pack is named entry
 * by entry — each test file, and each folder with its trailing "/" — read from the folder itself.
 */
const CHAT = "src/app/api/chat";
const REPLAY_PACK = `${CHAT}/replay-pack`;
function chatWithoutReplayPack(): string[] {
  return readdirSync(CHAT, { withFileTypes: true })
    .filter((entry) => `${CHAT}/${entry.name}` !== REPLAY_PACK)
    .filter((entry) => entry.isDirectory() || /\.test\.tsx?$/.test(entry.name))
    .map((entry) => `${CHAT}/${entry.name}${entry.isDirectory() ? "/" : ""}`)
    .sort();
}
/** The chat folder without the pack, in two halves by name (`half` 0 or 1): each half is its own child. */
function chatHalf(half: 0 | 1): string[] {
  const all = chatWithoutReplayPack();
  const middle = Math.ceil(all.length / 2);
  return half === 0 ? all.slice(0, middle) : all.slice(middle);
}
/*
 * THE REPLAY PACK IN QUARTERS (QA, 9 Nov 2026 in halves, as the sibling app's; thirds since 21 Nov 2026; quarters since 24 Nov 2026): the sibling's
 * replay-pack child timed out at 540 s on CI as its pack grew, and this pack grows the same way. Nearly all of its time
 * is one file, `replay-pack-e2e.test.ts`, so it is split by case, not by file: the first child runs the whole folder
 * with the first part of the cases by id (`REPLAY_PACK_PART` "0"; the pack's other test files run there, once), the
 * others that one file with the next parts. Every case and every file still runs exactly once, with every new flag off.
 * Halves held until the first took 504 s of its 540 s on CI (21 Nov 2026) and the next cases pushed it over.
 * Quarters since 24 Nov 2026: the first third took 510 s of its 540 s on main fac6ee9 (the others 391 s and 393 s), and
 * the sibling app's ninth timed out the same day (ETIMEDOUT, no assertion failed) as cases were added. The job runs the
 * children one after another, so its total (28 of its 45 minutes) is unchanged.
 */
const REPLAY_PACK_PARTS = 4;
const REPLAY_PACK_E2E = `${REPLAY_PACK}/replay-pack-e2e.test.ts`;
const CHILDREN: readonly { readonly name: string; readonly paths: () => readonly string[]; readonly env?: Readonly<Record<string, string>> }[] = [
  { name: "src/lib/ai, src/lib/forms", paths: () => ["src/lib/ai", "src/lib/forms"] },
  { name: `${CHAT} (without the replay pack), first half by name`, paths: () => chatHalf(0) },
  { name: `${CHAT} (without the replay pack), second half by name`, paths: () => chatHalf(1) },
  { name: "src/app/api/forms", paths: () => ["src/app/api/forms"] },
  ...Array.from({ length: REPLAY_PACK_PARTS }, (_, part) => ({
    name: `${REPLAY_PACK}, part ${part + 1} of ${REPLAY_PACK_PARTS} of the cases by id`,
    paths: () => (part === 0 ? [REPLAY_PACK] : [REPLAY_PACK_E2E]),
    env: { REPLAY_PACK_PART: String(part), REPLAY_PACK_PARTS: String(REPLAY_PACK_PARTS) },
  })),
];

describe("existing chat and form suites with every new flag off", () => {
  for (const child of CHILDREN) {
    it.skipIf(CHILD)(
      `passes the suites whose expectations are already on main: ${child.name}`,
      () => {
        const env: NodeJS.ProcessEnv = { ...process.env, FLAGS_OFF_PARITY_CHILD: "1", ...child.env };
        delete env.VITEST;
        delete env.VITEST_WORKER_ID;
        delete env.VITEST_POOL_ID;
        for (const name of CHAT_QUALITY_FLAG_NAMES) env[name] = "off";
        const output = execFileSync(
          process.execPath,
          ["node_modules/vitest/vitest.mjs", "run", "--exclude", "src/lib/ai/flags-off-parity.test.ts", ...child.paths()],
          // The child's output (every suite's logs) passed Node's 1 MB default
          // buffer on CI and failed with ENOBUFS before any test failed.
          { env, encoding: "utf8", timeout: 540_000, stdio: "pipe", maxBuffer: 256 * 1024 * 1024 },
        );
        expect(output).toMatch(/Test Files[\s\S]*passed/);
      },
      560_000,
    );
  }
});
