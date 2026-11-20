import { describe, expect, it } from "vitest";

import { draftNotesFromCard, notesWithoutCardLines } from "./draft-notes";
import { addressTypedIn, withoutUntypedAddresses } from "./exit-details";

/**
 * Port from Ask Sunny #1119 (Pau via QA, item 19: "an exit form filled a home address the manager never typed"): the
 * exit form's Permanent Address is only ever an address the manager typed in the chat. Invented people and addresses.
 */
const ADDRESS = "412 Ashgrove Ln, Kearney, NE 68847";

describe("only the manager's own address (item 19)", () => {
  it("an address is the manager's when it is in what they typed, spacing and punctuation aside", () => {
    expect(addressTypedIn(ADDRESS, "her home address is 412 ashgrove ln kearney ne 68847")).toBe(true);
    expect(addressTypedIn(ADDRESS, "exit form for remy calder at west dodge, she quit without notice")).toBe(false);
    expect(addressTypedIn("", "anything")).toBe(false);
  });

  it("lines someone else wrote lose a labelled address the manager never typed, label and all", () => {
    const read = withoutUntypedAddresses(`Quit without notice. Home address ${ADDRESS}.`, "exit form for remy calder, she quit without notice");
    expect(read.text).toBe("Quit without notice.");
    expect(read.removed).toEqual([ADDRESS]);
    expect(withoutUntypedAddresses(`She quit; her permanent address is ${ADDRESS}, last day 11/12.`, "she quit").text).not.toMatch(/Ashgrove|address/);
  });

  it("an address the manager typed stays, and lines with none are untouched", () => {
    const typed = `Quit without notice. Home address ${ADDRESS}.`;
    expect(withoutUntypedAddresses(typed, `she quit without notice. her home address is ${ADDRESS}`)).toEqual({ text: typed, removed: [] });
    expect(withoutUntypedAddresses("Quit without notice.", "she quit")).toEqual({ text: "Quit without notice.", removed: [] });
  });

  it("Create reads the address from the manager's lines of the notes, never the card's own lines", () => {
    const card = draftNotesFromCard({ employeeName: "Remy Calder", employeeRole: null, locationName: "Omaha, West Dodge Rd", formDate: "2026-11-14", issue: `Quit without notice. Home address ${ADDRESS}.`, warningLevel: null, payrollDeduct: null, priorActions: null });
    expect(card.text).toMatch(/Ashgrove/);
    expect(addressTypedIn(ADDRESS, notesWithoutCardLines(card.text))).toBe(false);
    expect(addressTypedIn(ADDRESS, notesWithoutCardLines(`${card.text}\n\nher home address is ${ADDRESS}`))).toBe(true);
    // The card's lines keep their labels and lose only the address.
    const kept = withoutUntypedAddresses(card.text, notesWithoutCardLines(card.text)).text;
    expect(kept).toContain("Employee: Remy Calder");
    expect(kept).toContain("What happened: Quit without notice.");
    expect(kept).not.toMatch(/Ashgrove|address/i);
  });
});
