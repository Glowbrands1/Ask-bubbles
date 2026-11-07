# This-app-only: a denied fault is no attendance account (DESCRIBED_ATTENDANCE_CARD_ENABLED)

QA's Bubbles round-3 gate (7 Nov 2026): DENIAL_NO_ACCOUNT alone answers "ca for <name> not late" with a "what happened" ask. With DESCRIBED_ATTENDANCE_CARD on too, the card was drafted as "Policy: Attendance, from what you described ("late")": `describedAttendanceKeys` (`forms/ca-policy.ts`) counted the denied "late". With DESCRIBED_ATTENDANCE_CARD on, each denied fault ("not late", "was never late"; at most two words between, never a conjunction) is taken out before the attendance read (`withoutDeniedFaults`, `forms/denial-no-account.ts`). The protected `ai/form-proposal.ts` is unchanged.

Not ported: the sibling app has no DESCRIBED_ATTENDANCE_CARD (#546 was this app's, Pau's option A), so its attendance card is never drafted from a described account.
