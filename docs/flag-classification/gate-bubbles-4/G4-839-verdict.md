# Gate-Bubbles-4: #839 NEXT_PUBLIC_REPLY_QUOTE_LINES_ENABLED, head fefb0f77 (Coding-4): GO
- Base b3b8d525 (as Coding-4 named; production env from its production-flags.json, 369 flags). Clean merge, tsc clean. 1 OFF + 1 ON over src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms and src/components.
- 14895 tests (OFF 771 failing, ON 771). Changed 0. The replay pack's recorded replies are byte-identical OFF vs ON (server unchanged, as stated).
- src/components/rich-text.dom.test.tsx passes 23/23 and rich-text-report-links.dom.test.tsx 3/3 in both arms.
- Not checked here: the live renderer. NEXT_PUBLIC_* is read at build time, so turning it on needs the env var and a redeploy, then a live look at a reply with "> " lines.
