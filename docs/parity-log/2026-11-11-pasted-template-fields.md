# A pasted template fills the open draft's fields (ported)

PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT_ENABLED, ported from the sibling app (its
round-25 live test of sf-s21, 11 Nov 2026). Stacked on this app's
PASTED_OUTLINE_TO_OPEN_DRAFT port (#728), which it builds on. One difference:
here the route's general revision answers a pasted template first ("I haven't
changed the … — everything on it is as it was."), so with the flag on a pasted
labelled template it changed nothing for falls through to the open-draft path.
The sibling app has the same fall-through for parity.
