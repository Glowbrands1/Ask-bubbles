# FORM_EDIT_TOUCHES_UPDATED_AT: ported from Ask Sunny

**Change in Ask Sunny** (its batch F8, 15 Nov 2026): a chat edit that writes only values left
`form_instances.updated_at` unchanged, because the touch trigger fires on the instance row and a value edit writes
only `form_instance_values`. Behind `FORM_EDIT_TOUCHES_UPDATED_AT_ENABLED` (default off), the one writer
(`writeFormEdits`) now touches the instance's `updated_at` whenever it writes.

**Ask Bubbles: ported** (v2-Coding-5, 15 Nov 2026). Bubbles has the same trigger and the same writer, and nothing in it
moved `updated_at` on a value edit. The same mechanism and flag; `src/lib/forms/form-edit-touches-updated-at.test.ts`
fails without the fix and passes with it. The older direct `applyAssistantRevision` path is in protected
`instances.ts`, unchanged in both apps.
