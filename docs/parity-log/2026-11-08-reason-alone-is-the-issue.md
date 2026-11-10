# This app only: with the sales flags, a request whose only words are its reason keeps that reason as the Issue

QA's Bubbles round-5 gate (8 Nov 2026): with SALES_SHORTFALL_OBJECT + SALES_OBSERVATION_ACCOUNT on, "I need a corrective action for <A> for under performance" lost its Issue (off: "Issue: under performance"). Here `observationAccount` (`forms/ca-policy.ts`) reads the card's Issue (`forms/incident-issue.ts` accountOnly), and a sentence that is only a reason is request matter, so the Issue was empty. A reason with nothing else said now stays the Issue.

Not needed in the sibling app: there `observationAccount` reads only the card's Observation, never an Issue, and the sibling's gate passed (ask-sunny#664).
