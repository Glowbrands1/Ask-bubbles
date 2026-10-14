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
