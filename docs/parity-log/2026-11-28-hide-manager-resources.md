# Manager Resources hidden from everyone (28 Nov 2026)

The owner, 28 Nov 2026, about Ask Sunny's Manager Resources page: "hide this to
everyone since i think all inside are placeholders".

**Sunny-only change; nothing to hide here.** Ask Bubbles never ported the
Manager Resources page: there is no `/resources` route, sidebar entry,
`view_manager_resources` permission, Overview action, What's New entry or
`read_manager_resources` reader. Ask Sunny hid all of those behind one switch,
`MANAGER_RESOURCES_ENABLED` (default off, `src/config/manager-resources.ts`
there).

**Ported here: the guard.** `src/config/no-manager-resources.test.ts` (the
owner's words) fails if a later port brings the page, its sidebar entry, its
permission or its reader into this app, and the replay case
`nov28-no-manager-resources-not-offered` asks "where are the manager
resources?" through the real chat route and asserts the model is offered no
such tool and is told of no such page. The replay pack's stand-in model now
records the tool names it was offered (`toolNames`), as Sunny's does.
