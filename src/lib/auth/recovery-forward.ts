import { SET_PASSWORD_PATH } from "@/lib/auth/routes";

/**
 * ============================================================================
 * RECOVERY LINKS THAT LAND ON THE WRONG PAGE.
 * ============================================================================
 *
 * Supabase's default recovery email goes to `/auth/v1/verify`, which redirects
 * to the `redirect_to` the request carried — but ONLY if that URL is on the
 * project's allowlist. When it is not (or the link was sent from the dashboard,
 * or by an older client), Supabase silently substitutes the Site URL, and the
 * person lands on `https://<site>/#access_token=…&type=recovery`.
 *
 * A URL fragment never reaches a server, so no route handler can see this; the
 * server just renders `/`, which redirects a signed-out visitor to the sign-in
 * screen with the fragment still attached. That is the "SIGN IN instead of
 * Create a New Password" failure.
 *
 * The fix has to run in the browser, before anything paints, on whatever page
 * the link lands on. `RECOVERY_FORWARD_SCRIPT` does that: it is inlined at the
 * top of the document by the root layout, and sends a recovery fragment to
 * `/reset-password` (which already consumes it and scrubs it from the URL).
 *
 * The decision is a pure function so it is testable; the script is that same
 * function serialised, so the two cannot drift. It must therefore stay
 * SELF-CONTAINED — no imports, no outer variables inside the function body.
 * It never logs, and never sends the fragment anywhere: `location.replace`
 * keeps it in the browser, and replaces the history entry so the back button
 * does not return to a page holding the token.
 */

/** Where a recovery fragment is forwarded. Kept in sync with `SET_PASSWORD_PATH`. */
export const RECOVERY_FORWARD_PATH = SET_PASSWORD_PATH;

/**
 * Returns the URL to move to, or `null` to leave the page alone.
 *
 * - A fragment with an access token AND `type=recovery` is a recovery link,
 *   wherever it landed. (Invitation links carry `type=invite` and are left to
 *   their own flow.)
 * - A fragment carrying Supabase's refusal (`error_code=otp_expired`,
 *   `access_denied`…) is forwarded only from the home page or sign-in screen,
 *   where it would otherwise be ignored. Those are the places the Site URL
 *   fallback sends people; `/reset-password` turns it into the friendly
 *   "request a new link" screen.
 */
export function recoveryForwardTarget(pathname: string, hash: string): string | null {
  // NOTE: self-contained on purpose — see the file header.
  if (pathname === "/reset-password" || hash.length < 2) return null;

  const fragment = new URLSearchParams(hash.charAt(0) === "#" ? hash.slice(1) : hash);

  if (
    fragment.get("access_token") &&
    fragment.get("refresh_token") &&
    fragment.get("type") === "recovery"
  ) {
    return "/reset-password" + hash;
  }

  if (
    (fragment.get("error") || fragment.get("error_code")) &&
    (pathname === "/" || pathname === "/login")
  ) {
    return "/reset-password" + hash;
  }

  return null;
}

/** Inline script text: runs `recoveryForwardTarget` against the current page. */
export const RECOVERY_FORWARD_SCRIPT = `(function(){try{var t=(${recoveryForwardTarget.toString()})(location.pathname,location.hash);if(t){location.replace(t)}}catch(e){}})();`;
