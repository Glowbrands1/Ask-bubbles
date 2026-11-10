/**
 * Separator between a conversation's retained manager turns.
 *
 * Its own module so that `bounded-context.ts` can import readers whose own
 * imports use it (`form-date-answer.ts`, `ca-policy.ts` …) without an import
 * cycle. `bounded-context.ts` re-exports it; the value is unchanged.
 */
export const JOIN = "\n\n";
