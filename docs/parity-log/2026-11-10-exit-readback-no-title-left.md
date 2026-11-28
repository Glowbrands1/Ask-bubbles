# Bubbles-only: the exit read-back with no title left (part of FULL_POSITION_TITLE_ENABLED)

QA (10 Nov 2026): when the exit card's title is taken off as another person's ("Isaura Corvadine\nDistrict Manager
Brenna Kowaldane\n…", QA's ruling (a)), this app's read-back kept a blank line where its Job Title line was removed,
left Job Title off the "Left blank" list, and still said "The title on the form is the one you gave (District
Manager)" with no title saved. With the flag the read-back says what was saved.

Not needed in the sibling app (checked on its claude/coding3-full-position-title, merged with main ed18d1fc): its
twin case nov6-coding3-full-position-title-dm-line passes with production's flags. Its read-back filters the line out,
lists Job Title as left blank, and has no "the one you gave" sentence. The other half of the fix (schedule and status
words after a title are no person, `forms/title-of-another-person.ts`) is in both apps under the same flag.
