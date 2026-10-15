# Additional locations on invitations

The **Invite someone** dialog can now give a person a primary area **and** any
number of additional locations, picked from a searchable list or suggested from
Woven. They can be edited later from the Team list.

## Schema changes

**None.** `app_users.scope_also_covers_area_ids text[]` already existed, is read
into every session, and every resolver already unions it with the primary
(`forms/location-scope.ts`, reporting scope). `locationIdsInArea("loc-…")` is
that one location, so an explicit location beside a district/region scope works
with no resolver change (pinned in `additional-locations.test.ts`). The dialog
simply sent `[]`. Locations are stored by **stable id** (`loc-66`), never name.

## What changed

- **Invite dialog:** optional *Additional locations* searchable multi-select with
  removable chips, directly under *Primary area*. It excludes the primary,
  prevents duplicates, and is hidden for global scope.
- **Team list:** shows additional locations; *Edit locations* changes only that
  list (level, primary, role, status untouched).
- **Server (`normalizeScope`):** de-duplicates, removes the primary, clears for
  global, caps at 60, and **refuses** unknown ids rather than storing a grant
  that does nothing.
- **Grant containment (new):** `inviteUser` has no `assertCanGrant`, so a
  non-global administrator could previously have named any location. For
  additional locations, an administrator may now add only locations inside their
  own coverage (only the *newly added* ones on an edit, so removals and unrelated
  edits are never blocked). An actor whose scope is unknown can add none.
- **Woven suggestion:** `GET /api/admin/employees/woven/invite-suggestion?email=`
  (`manage_users` **and** `manage_integrations`). Nothing fills until the
  administrator clicks **Apply suggestions**; everything stays editable.

## Woven suggestion rules

Reuses `suggestLocations`: a Woven location counts only when an administrator
mapped it to a roster location (never by name or Woven number); temporary or
expiring access never feeds it. Never suggested: an administrative role, a
global scope (Woven "all locations" is shown as a note), a role for an employee
with a protected role override, or anything for someone who is not Active, has a
termination conflict, shares an email, or whose Woven location belongs to
another brand. A mapping can narrow a role's reach, never widen it.

## Limitations

- **No districts or regions are configured** in this repository's roster yet, so
  only *One location* scope can currently be sent; the district/region options
  stay disabled until an area exists (unchanged behaviour). Explicit extras
  beside a district/region are supported once areas exist.
- A district/region **primary** is not suggested from Woven (Woven names a
  location, not the area).
- The roster is the 7 configured locations; others cannot be assigned until
  added.
- Primary-area grants on `inviteUser` are still not containment-checked (existing
  behaviour, out of scope here); only additional locations are.
