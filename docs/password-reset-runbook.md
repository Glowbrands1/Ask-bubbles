# Password reset: flow and Supabase settings

## Flow (all in this repo)

1. `/forgot-password` posts to `POST /api/auth/forgot-password`.
2. The route calls `auth.resetPasswordForEmail(email, { redirectTo })` server-side with
   `redirectTo = ${NEXT_PUBLIC_SITE_URL}/reset-password`. The response is identical whether or not
   the address exists.
3. The email link:
   - with the template in `docs/supabase-reset-password-template.html`:
     `${SiteURL}/auth/recovery-start?token_hash=…&type=recovery` → `/auth/recovery-continue`
     (a button, so mail scanners cannot burn the one-time token) → `POST /auth/recovery-start`
     verifies the token (`verifyOtp`) → `/reset-password`.
   - with Supabase's default template: `…/auth/v1/verify?token=…&redirect_to=<redirectTo>` →
     `/reset-password#access_token=…`, which the page consumes client-side.
4. `/reset-password` shows the new-password + confirmation form (12+ characters), handles
   expired/used links, and saves with `supabase.auth.updateUser({ password })`.

## Supabase Auth settings (project `dyurgwieyltnhphihwwj`) — Authentication → URL Configuration

| Setting | Value |
| --- | --- |
| Site URL | `https://askbubbles.vercel.app` (no trailing slash, **not** localhost) |
| Redirect URLs | `https://askbubbles.vercel.app/reset-password`, `https://askbubbles.vercel.app/auth/accept`, `https://askbubbles.vercel.app/auth/callback`, `https://askbubbles.vercel.app/auth/recovery` |
| Remove | any `http://localhost:*` entry on the production project |

Authentication → Email Templates → **Reset Password**: paste `docs/supabase-reset-password-template.html`.
The template builds its link from `{{ .SiteURL }}`, so a wrong Site URL breaks the email.

Vercel (Production): `NEXT_PUBLIC_SITE_URL=https://askbubbles.vercel.app`.

## Manual QA

Request reset → open the email link → click Continue → set a new 12+ character password →
confirm success screen → sign out → sign in with the new password. Also open the same link a
second time and confirm it says the link is spent and offers a new reset.

## Why a recovery email can land on `/` (and why employees no longer notice)

Supabase's default email links to `/auth/v1/verify?...&redirect_to=<URL>`. If `<URL>` does not match an entry
in Redirect URLs **exactly**, Supabase substitutes the Site URL and the browser lands on
`https://askbubbles.vercel.app/#access_token=…&type=recovery`. Production logs showed exactly this:
`redirect_to=https%3A%2F%2Faskbubbles.vercel.app` (bare origin) although the app asks for `/reset-password`.

A URL fragment never reaches a server, so the app cannot fix this server-side. Instead the root layout inlines
`RECOVERY_FORWARD_SCRIPT` (`src/lib/auth/recovery-forward.ts`), which runs before first paint on every page and
forwards `type=recovery` fragments (and Supabase's `#error=…otp_expired` refusals, from `/` and `/login`) to
`/reset-password`. That page consumes the token, removes it from the URL, and shows the form or the friendly
"Request a new link" screen. Invitation links (`type=invite`) are untouched. No custom SMTP is needed.

Still correct the allowlist (exact entry `https://askbubbles.vercel.app/reset-password`, no trailing slash) so
links go straight there, but the app works either way.

## Email scanners

Outlook/Defender "safe links" can open the link before the employee does and use up the one-time token. With the
default template the employee then gets "no longer valid" + **Request a new link**. Pasting
`docs/supabase-reset-password-template.html` into the Reset Password template prevents it (the token is only
spent when the person presses Continue).

## 2026-10-14 production investigation: "This reset link is no longer valid" one second after clicking

Evidence (Supabase auth + edge logs, fresh email sent 19:39:33Z):

| Time (UTC) | Event |
| --- | --- |
| 19:39:33 | `mail.send` recovery. Sent by our server route (`node` user agent, after the `app_users` eligibility lookup). |
| 19:39:44 | **`GET /verify` succeeds ("login", implicit) from 72.153.231.20 with an Android Chrome 133 mobile user agent. Not the employee's desktop.** 11 s after the email was sent. |
| 19:40:01–02 | `HEAD /verify` (405, Microsoft Exchange Online Protection IP 104.47.x, harmless) then the employee's own `GET /verify` from 180.190.252.184: `403 One-time token not found`. |

Conclusions:

1. Supabase did not reject a valid token and our handler did not lose a session. **The one-time token was already spent by another client before the employee clicked.** The employee's request returned `#error=access_denied&error_code=otp_expired` to the site root, which the app forwarded to `/reset-password` and rendered as the friendly "no longer valid" screen (as designed).
2. Supabase's default recovery email is `{{ .ConfirmationURL }}`: a URL on `supabase.co` that **any GET consumes**. Corporate mail filters, phone mail apps with link previews and "safe link" scanners fetch every link in a message, so the token is gone before a person clicks. The app cannot intercept it: the link points at supabase.co, not at us. This is a property of the default template, not a bug in the app, and custom SMTP does not change it.
3. The same log shows `redirect_to=https://askbubbles.vercel.app/` (the Site URL, with a trailing slash) for an email our server asked to send with `redirectTo=<NEXT_PUBLIC_SITE_URL>/reset-password`. Supabase only substitutes the Site URL when the requested `redirectTo` does not match its Redirect URLs allowlist. So either the Vercel value of `NEXT_PUBLIC_SITE_URL` is not exactly `https://askbubbles.vercel.app`, or the allowlist entry does not match what is sent. The forward script in PR #38 makes this harmless for recovery links, but it should be corrected.

### The only reliable fix: scanner-safe email template (no custom SMTP needed)

Paste `docs/supabase-reset-password-template.html` into Supabase → Authentication → Email Templates → **Reset Password**. The link then points at `https://askbubbles.vercel.app/auth/recovery-start?token_hash=…`, which a scanner can GET without effect: it only shows a **Continue** button (`/auth/recovery-continue`). The token is spent only when a person presses the button (`POST /auth/recovery-start` → `verifyOtp`). The whole path already exists in the app and is covered by tests (`app/auth/recovery-start`, `recovery-continue`).

Email templates are editable on Supabase's built-in email service; custom SMTP is not required (the built-in service is rate limited to a few emails per hour and meant for testing, which matters when testing repeatedly).
