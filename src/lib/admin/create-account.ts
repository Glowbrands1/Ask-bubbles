import "server-only";

import { isKnownAreaId, LOCATION_ID_PREFIX, locationIdsInArea } from "@/lib/locations";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import type { AccessScope, Role } from "@/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/supabase/like";
import {
  DirectoryError,
  audit,
  isRole,
  normalizeDisplayName,
  normalizeEmail,
  normalizeScope,
  readUser,
  type DirectoryActor,
  type DirectoryUser,
} from "@/lib/admin/user-directory";

/**
 * ============================================================================
 * CREATE AN ACCOUNT WITHOUT SENDING ANYTHING. Administrator-initiated only.
 * ============================================================================
 *
 * `inviteUser` always mails an invitation (`inviteUserByEmail`). This is the
 * manual alternative: `auth.admin.createUser` makes the credential and sends
 * NO email, code or notification. It is given NO password — none is generated,
 * stored or returned — so the person cannot sign in until an administrator
 * hands them a link with the existing "Generate reset link"
 * (`lib/admin/reset-link.ts`), which they use to choose their own password.
 *
 * THE PROFILE IS CREATED `disabled`, so the account is unusable and cannot even
 * request its own password reset (`recoveryEligibility` refuses disabled
 * accounts) until an administrator takes the two existing steps, in order:
 * re-enable the account in User Management, then "Generate reset link" and
 * send it privately. Credential setup is therefore administrator-controlled
 * and nothing is sent automatically. The account is created only by a person
 * calling this (never by a Woven sync), with a role and scope that
 * `assertCanGrant` allows this administrator to give.
 *
 * Duplicate protection is the same as the invite: an existing profile with the
 * email is refused, the unique index on lower(email) is the rule, and a
 * credential left without a profile is deleted again.
 */
/** Roles above Admin. Only an owner or developer may hand them out. */
const ABOVE_ADMIN: readonly Role[] = ["owner", "developer"];

/**
 * WHO MAY GRANT WHAT — checked on the server, whatever the form showed.
 *   - Admin, Owner and Developer need an explicit confirmation, never a default.
 *   - Owner and Developer may be granted only by an owner or developer.
 *   - Global scope is a scope, not a role: it is granted on its own, and only
 *     by an actor whose own scope is global.
 *   - A non-global actor may grant only locations inside their own coverage.
 *   - Every area must be on the roster; an unknown id is refused, not stored.
 */
export function assertCanGrant(actor: DirectoryActor, role: Role, scope: AccessScope, confirmAdmin: unknown): void {
  const isAdminRole = (ADMIN_CONSOLE_ROLES as readonly string[]).includes(role);
  if (isAdminRole && confirmAdmin !== true) {
    throw new DirectoryError("invalid_input", "Confirm that you are deliberately giving this person administrator access.");
  }
  if ((ABOVE_ADMIN as readonly string[]).includes(role) && !(ABOVE_ADMIN as readonly string[]).includes(actor.role)) {
    throw new DirectoryError("forbidden_grant", "Only an owner or developer can give that role.", 403);
  }

  if (scope.level === "global") {
    if (actor.scope?.level !== "global") {
      throw new DirectoryError("forbidden_grant", "Only someone with access to all locations can give access to all locations.", 403);
    }
    return;
  }
  if (scope.level !== "location") {
    throw new DirectoryError("invalid_input", "Choose one location, several locations, or all locations.");
  }
  const areas = [scope.primaryAreaId, ...scope.alsoCoversAreaIds].filter((id): id is string => typeof id === "string");
  if (areas.length === 0 || areas.some((id) => !id.startsWith(LOCATION_ID_PREFIX) || !isKnownAreaId(id))) {
    throw new DirectoryError("invalid_input", "Choose Buff City Soap locations from the list.");
  }
  if (actor.scope?.level !== "global") {
    const own = new Set(
      [actor.scope?.primaryAreaId, ...(actor.scope?.alsoCoversAreaIds ?? [])]
        .filter((id): id is string => typeof id === "string")
        .flatMap((id) => locationIdsInArea(id)),
    );
    if (actor.scope?.level !== "location" || areas.some((id) => !own.has(id))) {
      throw new DirectoryError("forbidden_grant", "You can only give access to locations you can access yourself.", 403);
    }
  }
}

export async function createAccountWithoutEmail(
  input: { email: unknown; displayName: unknown; role: unknown; scope: unknown; confirmAdmin?: unknown },
  actor: DirectoryActor,
): Promise<DirectoryUser> {
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName, email);
  const normalized = normalizeScope(input.scope);
  /* The same location listed twice is one location. */
  const scope = { ...normalized, alsoCoversAreaIds: [...new Set(normalized.alsoCoversAreaIds)].filter((id) => id !== normalized.primaryAreaId) };

  if (!isRole(input.role)) throw new DirectoryError("invalid_input", "Choose a role for this person.");
  const role = input.role;
  assertCanGrant(actor, role, scope, input.confirmAdmin);

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin.from("app_users").select("id").ilike("email", escapeLike(email)).maybeSingle();
  if (existing) {
    throw new DirectoryError("duplicate_email", "Somebody already has an Ask Bubbles account with that email address.", 409);
  }

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data?.user) {
    // The provider's text can disclose that an address already has a credential.
    throw new DirectoryError("provider_failed", "The account could not be created.", 502);
  }
  const subject = created.data.user.id;

  const { error } = await admin.from("app_users").insert({
    id: subject,
    email,
    display_name: displayName,
    role,
    status: "disabled",
    scope_level: scope.level,
    scope_primary_area_id: scope.primaryAreaId,
    scope_also_covers_area_ids: scope.alsoCoversAreaIds,
    created_by: actor.id,
    updated_by: actor.id,
  });
  if (error) {
    await admin.auth.admin.deleteUser(subject).catch(() => {
      /* The profile insert already failed; nothing better to do. */
    });
    throw new DirectoryError("provider_failed", "The account could not be created. Nothing was saved.", 502);
  }

  await audit({ targetUserId: subject, targetEmail: email, actor, action: "invited", from: "created_without_email", to: role });
  return readUser(subject);
}
