# Database checks

`rls_checks.sql` runs after every migration has been applied to a throwaway
local cluster (`npm run verify:migrations`). It impersonates the browser roles
exactly as PostgREST does and raises on the first failure, inside a
transaction that is rolled back.

It proves:

1. every `public` table has RLS enabled **and forced**;
2. `anon` holds no table, view or function privilege;
3. `authenticated` holds exactly SELECT on `app_users` and EXECUTE on
   `accept_invitation()`;
4. a signed-in user reads only their own profile (no cross-user read);
5. a signed-in user cannot insert, update or delete any profile through the API
   (no self-elevation of role or scope);
6. the self-elevation trigger refuses a role change or self re-enable even
   where a write path exists;
7. every other table and view is unreadable by a signed-in user, and the
   reporting, analytics, retrieval and Woven RPCs are not callable;
8. a user with no profile sees nothing and cannot accept an invitation;
9. a disabled account cannot re-activate itself, and an invited account
   accepting its invitation changes status only — never role or scope;
10. the last active administrator cannot be demoted or disabled;
11. storage buckets are private and carry no browser policies.

The checks were mutation-tested: granting a browser role a table, removing
FORCE RLS, or granting UPDATE on profiles each makes the suite fail.
