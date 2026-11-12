## 12 Nov 2026: RESENT_REQUEST_IS_YES stays Ask Bubbles only — Ask Sunny keeps the name already

In this app, an exit request with a pasted letter got "Is this for **<roster name>**? Tell me if that should change.",
and sending the same request again got "Who is this **Resignation/Exit Form** for?" — the offered name was lost (found
on production's flags, 12 Nov 2026; replay `nov12-resent-exit-request-keeps-name`).

Checked on Ask Sunny's main (b5f9d6ce1, its production flags, the same turns with its company and an invented person):
the second send gives the Resignation/Exit Form card for the offered name. Nothing to port.
