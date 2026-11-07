# Bubbles-only note: REPLY_MATCHES_CARD rule 5 and a denial-only account (BARE_NOT_DENIAL_ENABLED)

The sibling app's second gate (6 Nov 2026) found REPLY_MATCHES_CARD's rule 5 removing "You haven't told me what happened yet" when the card's Issue was only a denial ("not late"), undoing its BARE_NOT_DENIAL_ENABLED fix. There, under that flag, rule 5 no longer counts an Issue or account line whose every clause only denies a fault.

Not ported here: this app has neither BARE_NOT_DENIAL_ENABLED nor the CA what-happened ask (CA_ASKS_WHAT_HAPPENED), so no reply here carries "You haven't told me what happened yet" for rule 5 to keep, and rule 5 is unchanged. REPLY_MATCHES_CARD is live here; nothing about it changes. If this app takes the what-happened ask, the rule-5 condition goes with it.

Also in this change: flags-off-parity's flag list gains TITLE_ENDS_AT_LINE_ENABLED and PLACE_FROM_CUE_ENABLED, so its child run forces them off like the others (test-only; CI sets neither).
