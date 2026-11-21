import type { DirectoryRow } from "./cases";

/**
 * The loop cases' own roster (the loop port, QA2 for Pau, 21 Nov 2026): freshly invented people at this app's Omaha
 * West Dodge store, the pack's store (`WEST_DODGE`). The loop cases use none of the pack's older names, and none of the
 * people the sibling app's loop fixtures, examples or cases use (`agent-loop/no-sibling-content.test.ts`).
 */
export const LOOP_FENNA: DirectoryRow = { id: "e-fenna-prewitt", firstName: "Fenna", lastName: "Prewitt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
export const LOOP_OZREN: DirectoryRow = { id: "e-ozren-brack", firstName: "Ozren", lastName: "Brack", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Full Time" };
export const LOOP_THADDEA: DirectoryRow = { id: "e-thaddea-kroll", firstName: "Thaddea", lastName: "Kroll", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

export const LOOP_STAFF: readonly DirectoryRow[] = [LOOP_FENNA, LOOP_OZREN, LOOP_THADDEA];

/*
 * QA's live re-test (21 Nov 2026, items 9 and 12): a second "Fenna" at this app's other store (`TWO_STORES`' loc-67), so
 * two people share a first name at different stores. Invented; used only by the cases that need the shared first name.
 */
export const LOOP_FENNA_OSTRANDER: DirectoryRow = { id: "e-fenna-ostrander", firstName: "Fenna", lastName: "Ostrander", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67"], positionName: "Team Member Part Time" };
