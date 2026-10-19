/**
 * `%`, `_` and `\` are wildcards to PostgREST's `ilike`. An email address may
 * legitimately contain `_`, so an unescaped lookup can match a different
 * person's address and report a duplicate that does not exist. Every
 * `.ilike()` taking a value that came from a person goes through this.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
