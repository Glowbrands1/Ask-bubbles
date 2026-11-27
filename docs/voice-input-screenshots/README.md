# Voice input screenshots (draft pull request evidence)

Taken on 27 Nov 2026 from a local `next dev` (demo mode, signed in as the demo Location Manager) with Chromium's fake
microphone. `POST /api/chat/voice` was stubbed in Playwright, so no recording left the machine. This commit can be
dropped before merge.

Voice is off in demo mode by design, so for the "on" shots a local-only patch (never committed) made the (app) layout
hand `{ enabled: true }` to `VoiceAccessProvider`. The two "off" sets used the real gate with no patch:

- `switch-on-email-not-listed-*`: `VOICE_INPUT_ENABLED=true`, a key set, `VOICE_INPUT_USERS` listing someone else. No mic.
- `flag-off-*`: no voice variables. No mic, and the box as before.

Boxes: `A-chat` is the main chat composer and `B-overview` is the Overview ask band. Box C (`AskAboutReport`) is not
mounted on any page on `main`, so it cannot be opened. Box D (the L10 assistant) needs the Leadership Hub. Both are
covered by their DOM tests.

Per box: `1-idle`, `2-recording-timer`, `3-warning-50s`, `4-transcribing`, `5-text-in-box` ("Check the words, then press
Send"), `6-first-use-notice`, `7-error-*` (every sentence, with typed text kept), `8-phone-390`.
