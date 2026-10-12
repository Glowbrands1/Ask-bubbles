/**
 * Tells "the table is not there" (the migration has not been applied) from "the
 * database did not answer", so the screen can say which. Looks only at error
 * CODES and the fixed phrases Postgres and PostgREST use for a missing relation;
 * the message is never returned or logged.
 */
export function classifyDatabaseError(error: { message?: string; code?: string } | null): "missing" | "unavailable" {
  if (!error) return "unavailable";
  const code = error.code ?? "";
  // 42P01 undefined_table, 42883 undefined_function, PGRST202/PGRST205 PostgREST "could not find the function/table".
  if (code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205") return "missing";
  const message = error.message ?? "";
  if (/relation .* does not exist|could not find the (table|function)|function .* does not exist/i.test(message)) return "missing";
  return "unavailable";
}
