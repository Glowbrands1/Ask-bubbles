# Invite links forwarded to /auth/accept (Ask Bubbles, 28 Nov 2026): not ported to Ask Sunny

**Change in Ask Bubbles.** Pau invited herself to test the new-hire link: "it auto sends me to curt's log in when i
invited myself". Supabase sent the invitation to the Site URL with the session in the URL fragment (the accept page was
not on its redirect allow list), so the browser showed the session already open there and the account stayed invited.
`src/lib/auth/recovery-forward.ts` already forwarded password-recovery fragments to their page; it now forwards a
`type=invite` fragment carrying both tokens to `/auth/accept` the same way.

**Ask Sunny: not needed because its invitation already lands on `/auth/accept`.** The same test in Ask Sunny the same
day (an invitation to Pau's test address) opened the accept page, set a password and signed in; the account became
active. Ask Sunny has no fragment-forwarding module to extend. If its redirect allow list ever loses the accept page,
port this module.
