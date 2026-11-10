## 10 Nov 2026: CA_SHORTHAND_REQUEST_ENABLED stays in this app

October triage #9 (#181): "an employee opened the store 15 min late and needs CA", "write ca", "crete a ca for …" and
"writen ca …" got a process answer and no card here. With the flag on, a verb asking for the document, typed with no
article or misspelt, directly before "CA" asks for the Corrective Action Form (`forms/template-intent.ts`).

**Not ported to the sibling app.** Its production runs with INTENT_EXTRACTION on, and that path already gives a
Corrective Action card for all four turns (checked on its `main` f337302d with its production flags, 10 Nov 2026). The
reader here is the path this app's production takes; the sibling's copy of it is not on its production path.
