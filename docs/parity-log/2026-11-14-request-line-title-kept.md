## 14 Nov 2026: REQUEST_LINE_TITLE_KEPT stays Bubbles-only

QA's Bubbles 17x live test: "create corrective action form for <A>, Team Member Part Time" left the card's
employeeRole null. The title reader read "Team Member"; TITLE_OF_THE_EMPLOYEE then read the rest of the position name,
"Part Time", as another person's name beside the title (`forms/title-of-another-person.ts`) and took the title off.
With REQUEST_LINE_TITLE_KEPT_ENABLED (default off) words that complete a company position name are the title.

Sibling app: not needed. Ask Sunny's positions (`staff-picker.ts` SALON_TITLES: Tanning Consultant, Salon Director,
Assistant Salon Director) are read whole by its title reader; none has capitalised words after a shorter title that
could be read as a name, which is what this fixes.
