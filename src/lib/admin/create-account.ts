import "server-only";

import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
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
 * The profile is `active` because that is the state the reset-link tool
 * requires. It is not a risk: no password exists, and the account is created
 * only by a person calling this (never by a Woven sync) with a role that is
 * not administrative and a location scope.
 *
 * Duplicate protection is the same as the invite: an existing profile with the
 * email is refused, the unique index on lower(email) is the rule, and a
 * credential left without a profile is deleted again.
 */
export async function createAccountWithoutEmail(
  input: { email: unknown; displayName: unknown; role: unknown; scope: unknown },
  actor: DirectoryActor,
): Promise<DirectoryUser> {
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName, email);
  const scope = normalizeScope(input.scope);

  if (!isRole(input.role)) throw new DirectoryError("invalid_input", "Choose a role for this person.");
  const role = input.role;
  if ((ADMIN_CONSOLE_ROLES as readonly string[]).includes(role)) {
    throw new DirectoryError("protected_account", "Administrator accounts are not created here.", 403);
  }
  if (scope.level !== "location") {
    throw new DirectoryError("invalid_input", "Accounts created here are limited to a single location.");
  }

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin.from("app_users").select("id").ilike("email", email).maybeSingle();
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
    status: "active",
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
