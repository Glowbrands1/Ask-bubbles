import { describe, expect, it } from "vitest";

import { readReopenRequest } from "./reopen-request";

/**
 * "Change exit for jordan smith", "duplicate exit … and change date notice
 * given to 9-27-26", "show draft of exit" — the turns from the reference
 * platform's production feedback that were answered "I can't edit a form that
 * already exists". Read against Ask Bubbles' own form names.
 */
describe("reading a request for a form that already exists", () => {
  it.each([
    ["change exit for jordan smith", "resignation-exit", false],
    ["duplicate exit for jordan smith and change date notice given to 9-27-26", "resignation-exit", true],
    ["edit the exit form for Jordan Smith", "resignation-exit", false],
    ["revise jordan smith exit form", "resignation-exit", false],
    ["reopen the coaching form for Avery Stone", "coaching", false],
    ["can you edit the coaching form for Avery Stone to say she was late twice", "coaching", true],
    ["change her new location on the transfer form to store 24", "position-transfer", true],
    ["edit the CA for Avery Stone", "dpoa", false],
    ["change the corrective action form for Avery Stone", "dpoa", false],
  ])("%s → edit the %s", (question, templateKey, asksChange) => {
    expect(readReopenRequest(question)).toEqual({ mode: "edit", templateKey, asksChange });
  });

  it("reads 'show draft of exit' as showing the form", () => {
    expect(readReopenRequest("show draft of exit")).toEqual({
      mode: "show",
      templateKey: "resignation-exit",
      asksChange: false,
    });
  });

  it("names no template for 'edit the form', leaving the open form to decide", () => {
    expect(readReopenRequest("edit the form")).toEqual({ mode: "edit", templateKey: null, asksChange: false });
  });

  it.each([
    ["a new form", "create exit for Jordan Smith"],
    ["a new form, asked another way", "make a new exit form for Jordan Smith"],
    ["a pull-up request", "pull up a transfer form for jane doe"],
    ["another one", "start another coaching form for Avery"],
    ["a question about forms", "how do I change an exit form after it's finalized?"],
    ["a question about permission", "can I edit a finalized coaching form?"],
    ["a change with no form in it", "change it to two weeks"],
    ["a correction to the open form", "change the date to yesterday"],
    ["an ordinary question", "what is the dress code?"],
  ])("leaves %s alone", (_label, question) => {
    expect(readReopenRequest(question)).toBeNull();
  });
});
