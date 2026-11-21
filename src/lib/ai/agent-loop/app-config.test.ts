import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { appConfig, BUBBLES_CONFIG } from "./app-config";
import { agentLoopRules } from "./prompt";
import { rulesBookText } from "./rules-book";

/*
 * The agent loop's words are this company's (the loop port, QA2 and Pau, 21 Nov 2026): store wording everywhere, the
 * Forms Register, Buff City Soap, never the sibling app's places, metrics, rulings or name; Pau's rulings: the general
 * rulings on the shared JBA Policy Manual apply, no "Other" topics, terminations need DM/HR approval, no read_stats.
 */
describe("the agent loop speaks for this company", () => {
  const rules = rulesBookText();
  const prompt = agentLoopRules();

  it("runs with this app's config", () => {
    expect(appConfig()).toBe(BUBBLES_CONFIG);
    expect(BUBBLES_CONFIG.appName).toBe("Bubbles");
    expect(BUBBLES_CONFIG.locationWord).toBe("store");
    expect(BUBBLES_CONFIG.formsPageName).toBe("Forms Register");
    expect(BUBBLES_CONFIG.formKeys.exit).toBe("resignation-exit");
  });

  it("names no word of the sibling app's", () => {
    for (const word of [/\bsalons?\b/i, /Sunny/, /Sun Tan/i, /tanning/i, /\bPPTA\b/, /Club Close/, /Must See/i, /Form Monitoring/, /\bMSB\b/, /Daily Stats/, /stc-exit/, /Under Performance/]) {
      expect(rules, String(word)).not.toMatch(word);
      expect(prompt, String(word)).not.toMatch(word);
    }
  });

  it("uses its own words and Pau's rulings", () => {
    expect(prompt).toContain("You are Bubbles");
    expect(prompt).toContain("Buff City Soap");
    expect(rules).toContain("Forms Register");
    expect(rules).toMatch(/\bstores?\b/);
    expect(rules).toContain("DM/HR approval");
    expect(rules).toContain("is Late Opening");
    expect(rules).toContain("is the manual's Time Records section");
    // No "Other" topics of its own: "Other" only when no section covers it.
    expect(rules).toContain("\"Other — <topic>\" is only for an incident no section covers.");
    // No read_stats (Pau's decision 1).
    expect(prompt).not.toContain("read_stats");
    expect(rules).not.toContain("read_stats");
    expect(rules).not.toMatch(/^- (?:null|undefined)?$/m);
  });
});
