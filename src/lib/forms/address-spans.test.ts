import { describe, expect, it } from "vitest";

import { typedAddressSpans, withoutAddressLines } from "./address-spans";

/* QA (23 Nov 2026, the u22 live run): an address given as the employee's never names the card's store. */
describe("typed addresses, for the store readers", () => {
  it("reads QA's address line and blanks it, keeping the rest", () => {
    const text = "address: 123 Test St, Lees Summit, MO. 00000";
    expect(typedAddressSpans(text).map((span) => span.address)).toEqual(["123 Test St, Lees Summit, MO. 00000"]);
    expect(withoutAddressLines(text).trim()).toBe("address:");
    expect(withoutAddressLines(text)).toHaveLength(text.length);
  });

  it("a store named outside the address stays", () => {
    const text = "this is for the lees summit, mo store. address: 123 Test St, Kearney, NE 68847";
    expect(withoutAddressLines(text)).toMatch(/^this is for the lees summit, mo store\. address:\s+$/);
  });

  it("no address label, nothing blanked", () => {
    const text = "she worked at 123 Test St in Lees Summit";
    expect(withoutAddressLines(text)).toBe(text);
  });
});
