## 12 Nov 2026: SLOT_NAME_ON_FORM_REQUEST waits in Ask Bubbles — the port would be inert (follow-up to 2026-11-03)

The 3 Nov entry (`2026-11-03-slot-name-on-form-request.md`) said to port Ask Sunny's mechanism if FORM_STATE were ever turned off here. FORM_STATE is now off in this app's production. The port still waits, on QA's ruling of 12 Nov 2026.

- Sunny's mechanism (`withSlotEmployeeLine`) lives in `ai/intent-slots.ts`. That step runs only under INTENT_EXTRACTION_ENABLED, which is on in Ask Sunny and off in this app's production, so a port would change nothing live.
- The live symptom here, "Corrective action for the primary salon manager: …" with a lower-case name not on the roster answered as a policy question, is tracked as B-C2 (`nov4-name-pau-2-*`, assigned to Coding-4).

Port the mechanism when INTENT_EXTRACTION_ENABLED is turned on in this app.
