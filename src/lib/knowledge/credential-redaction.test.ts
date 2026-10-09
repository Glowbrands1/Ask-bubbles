import { describe, expect, it } from "vitest";

import {
  asksForDefaultCredentials,
  redactDefaultPasswords,
  rowsForQuestion,
  WITHHELD_PASSWORD,
} from "./credential-redaction";
import type { MatchedChunkRow } from "./mappers";

/*
 * A synthetic new-hire account section, shaped like the one the reference
 * platform found in an approved manual. Invented systems and stand-in values:
 * no real credential belongs in a test file.
 */
const NEW_HIRE_SECTION = [
  "New Hire Account Setup",
  "1. Register system: The new employee will need to immediately log in and create a password, the register default password is *example1",
  "2. Scheduling app: Then log in to the scheduling app and set the same password, the scheduling app default password is Ex4mple! plus the last four digits of the new hire's employee ID.",
  "3. Training portal: New Hire and Rehire employees will automatically receive an email.",
].join("\n");

const THERMOSTAT = 'Enter LOCK MENU. Enter Password "0000" on the number keypad. (Factory set password is "0000")';

function row(content: string): MatchedChunkRow {
  return {
    chunk_id: "c1",
    document_id: "d1",
    document_title: "Synthetic Manager Manual",
    category: "other",
    locator: "Page 40",
    page: null,
    section: null,
    content,
    similarity: 0.85,
  };
}

describe("redactDefaultPasswords", () => {
  const redacted = redactDefaultPasswords(NEW_HIRE_SECTION);

  it("withholds both default passwords and the rule that completes one", () => {
    expect(redacted).not.toContain("*example1");
    expect(redacted).not.toContain("Ex4mple!");
    expect(redacted).not.toMatch(/employee ID/i);
    expect(redacted.split(WITHHELD_PASSWORD)).toHaveLength(3);
  });

  it("keeps the rest of the section, so the answer can still point at it", () => {
    expect(redacted).toContain("New Hire Account Setup");
    expect(redacted).toContain("immediately log in and create a password");
    expect(redacted).toContain("Training portal: New Hire and Rehire employees");
  });

  it.each([
    ["the register default password is: Secret123", "Secret123"],
    ["the default password for the scheduling app is Secret123. Change it today.", "Secret123"],
    ["Default passwords are Soap Bar1 and Lather2", "Bar1"],
    ["the temporary password will be the employee's last name + 1234", "1234"],
    ["Default PIN: 4321", "4321"],
    ["the scheduling app default password is Ex4mple! plus the\nlast four digits of the new hire's employee ID.", "employee ID"],
    ["• Scheduling: the default password is Ex4mple! plus the last four digits of the new\nhire's employee ID.\n• Portal: email.", "employee ID"],
  ])("withholds %j", (text, secret) => {
    const out = redactDefaultPasswords(text);
    expect(out).not.toContain(secret);
    expect(out).toContain(WITHHELD_PASSWORD);
  });

  it("stops at the end of the sentence, the list item or the paragraph", () => {
    expect(redactDefaultPasswords("the default password for the portal is Secret123. Change it today.")).toMatch(/\. Change it today\.$/);
    expect(redactDefaultPasswords("1. the register default password is X1\n2. Portal: log in.")).toContain("2. Portal: log in.");
    expect(redactDefaultPasswords("• the default password is X1\n• Portal: email.")).toContain("• Portal: email.");
  });

  it("leaves policy text about passwords alone", () => {
    const policy = "Do not use default passwords, i.e., password123. The password should be 8-10 characters long.";
    expect(redactDefaultPasswords(policy)).toBe(policy);
  });

  it("leaves an equipment factory code alone", () => {
    expect(redactDefaultPasswords(THERMOSTAT)).toBe(THERMOSTAT);
  });

  it("never names another company's manual section", () => {
    expect(WITHHELD_PASSWORD).not.toMatch(/sunny|sun tan|new hire password process/i);
  });
});

describe("rowsForQuestion", () => {
  it("withholds defaults from a manager asking about their own password", () => {
    const [shown] = rowsForQuestion("How can I change my password", [row(NEW_HIRE_SECTION)]);
    expect(shown!.content).not.toContain("*example1");
    expect(shown!.chunk_id).toBe("c1");
  });

  it.each([
    "I'm a new hire, how do I change my password?",
    "on my first day I couldn't log in",
    "How can I change my password",
    "how do I reset my Ask Bubbles password",
  ])("withholds them for %j, which is about the asker's own password", (question) => {
    expect(asksForDefaultCredentials(question)).toBe(false);
  });

  it.each([
    "How do new hires set up their register password?",
    "What is the default password for the scheduling app?",
    "walk me through onboarding a new employee's logins",
  ])("keeps them for %j", (question) => {
    expect(asksForDefaultCredentials(question)).toBe(true);
    const [shown] = rowsForQuestion(question, [row(NEW_HIRE_SECTION)]);
    expect(shown!.content).toBe(NEW_HIRE_SECTION);
  });

  it("returns an untouched row unchanged", () => {
    const plain = row("Dress code: aprons are worn on every shift.");
    expect(rowsForQuestion("what is the dress code", [plain])[0]).toBe(plain);
  });
});
