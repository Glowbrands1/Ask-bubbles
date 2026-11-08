# This app only: once the request is cut, its place does not open the Issue (ACCOUNT_PLACE_LEAD_ENABLED)

QA's Bubbles round-5 final gate (8 Nov 2026) held the sales group back: with SALES_SHORTFALL_OBJECT + SALES_OBSERVATION_ACCOUNT on, "create a written CA for <name> at West Dodge Rd for missing the 10-15-26 woven deadline" (nov7-refusal-bub-phone) made the card's Issue "at West Dodge Rd for missing the 10-15-26 woven deadline": `observationAccount` cut the request's head and the name, not its place. With the flag on, a place that opens what is left ("at / in / from <place>" right before the request's "for"), and that "for" unless a performance reason follows, go.

Not needed in the sibling app: the same request there (its salon, its sales group on and off) already gives the Observation "missing the 10-15-26 woven deadline"; its observationAccount reads only the Observation, which another step has already cut. Checked on its main 1a6c330.
