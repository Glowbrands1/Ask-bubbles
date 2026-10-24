import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPANY_LOCATION_ENTRIES } from "@/config/company/locations";
import {
  CHAT_QUALITY_FLAG_NAMES,
  citationVerifyEnabled,
  modelRetryEnabled,
  promptCacheEnabled,
  requiredFieldsEnabled,
  storesTableEnabled,
} from "@/lib/config/chat-quality-flags";
import { activeStoreIndex, buildStoreIndex, primeStoreIndex, resolveStoreText } from "@/lib/stores/resolver";
import type { ChatFormProposal } from "@/types";

import { MODEL_MAX_RETRIES, MODEL_TIMEOUT_MS, __setAnthropicClient, Anthropic, getAnthropicClient } from "./anthropic";
import { callClaude, claudeSystemPayload, modelIsOverloaded } from "./call-claude";
import { keepVerifiedCitations, type CurrentManualChunk } from "./citation-verify";
import { AiError } from "./errors";
import { missingRequiredFields, requiredFieldSentence } from "./required-fields";

/**
 * Approved 24 Oct backend items. Each flag defaults off, and the off path
 * is the path these tests pin first.
 */

const FLAGS = [
  "PROMPT_CACHE_ENABLED",
  "MODEL_RETRY_ENABLED",
  "REQUIRED_FIELDS_ENABLED",
  "CITATION_VERIFY_ENABLED",
  "CHAT_TRACE_ENABLED",
  "STORES_TABLE_ENABLED",
] as const;

const SECRET = "GROUNDING-TEXT-THAT-MUST-NOT-BE-LOGGED";
const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

function proposal(overrides: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: "p-test",
    templateKey: "dpoa",
    templateName: "Corrective Action",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName: null,
    employeeRole: null,
    locationId: null,
    locationName: null,
    locationResolution: "needs_selection",
    authorizedLocationIds: [],
    status: "needs_employee",
    sourceMessageIds: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const name of FLAGS) delete process.env[name];
  if (ORIGINAL_ANTHROPIC_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_KEY;
  primeStoreIndex(null);
  __setAnthropicClient(null);
});

describe("the new chat flags default off", () => {
  it("is off until an explicit on-value, and each name is registered", () => {
    expect(promptCacheEnabled()).toBe(false);
    expect(modelRetryEnabled()).toBe(false);
    expect(requiredFieldsEnabled()).toBe(false);
    expect(citationVerifyEnabled()).toBe(false);
    expect(storesTableEnabled()).toBe(false);
    for (const name of FLAGS) expect(CHAT_QUALITY_FLAG_NAMES).toContain(name);
  });
});

describe("prompt caching", () => {
  it("sends the system prompt as a string when the flag is off", () => {
    expect(claudeSystemPayload("Stay in policy.", "JBA Policy Manual\npage 12")).toBe("Stay in policy.");
  });

  it("marks the system prompt and the manual block ephemeral when the flag is on", () => {
    process.env.PROMPT_CACHE_ENABLED = "1";
    expect(claudeSystemPayload("Stay in policy.", "  JBA Policy Manual\npage 12  ")).toEqual([
      { type: "text", text: "Stay in policy.", cache_control: { type: "ephemeral" } },
      { type: "text", text: "JBA Policy Manual\npage 12", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("omits an empty manual block", () => {
    process.env.PROMPT_CACHE_ENABLED = "true";
    expect(claudeSystemPayload("Stay in policy.", "  ")).toEqual([
      { type: "text", text: "Stay in policy.", cache_control: { type: "ephemeral" } },
    ]);
  });
});

describe("timeouts and a busy model", () => {
  it("keeps the SDK client when the flag is off, and sets 45s and 2 retries when it is on", () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = previousKey?.trim() || "test-key";
    try {
      const off = getAnthropicClient();
      expect(off.timeout).toBe(600_000);
      process.env.MODEL_RETRY_ENABLED = "1";
      const on = getAnthropicClient();
      expect(on.timeout).toBe(MODEL_TIMEOUT_MS);
      expect(on.timeout).toBe(45_000);
      expect(on.maxRetries).toBe(MODEL_MAX_RETRIES);
      expect(on.maxRetries).toBe(2);
      expect(on).not.toBe(off);
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
    }
  });

  it("keeps the existing failure sentence on 529 when the flag is off", async () => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "test-key";
    const error = Anthropic.APIError.generate(
      529,
      { type: "error", error: { type: "overloaded_error", message: `echo of ${SECRET}` } },
      `echo of ${SECRET}`,
      new Headers({ "request-id": "req_busy" }),
    );
    expect(modelIsOverloaded(error)).toBe(true);
    __setAnthropicClient({ messages: { create: async () => { throw error; } } } as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(callClaude({ system: "s", grounding: "g", history: [], question: "q", maxTokens: 32 })).rejects.toMatchObject({
      code: "model_failed",
      status: 502,
    });
    try {
      await callClaude({ system: "s", grounding: "g", history: [], question: "q", maxTokens: 32 });
    } catch (caught) {
      expect(caught).toBeInstanceOf(AiError);
      expect((caught as AiError).message).toMatch(/could not reach the language model/);
      expect((caught as AiError).message).not.toContain(SECRET);
    }
    log.mockRestore();
  });

  it("says the assistant is busy, and nothing from the request, when retries are on", async () => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "test-key";
    process.env.MODEL_RETRY_ENABLED = "on";
    const error = Anthropic.APIError.generate(
      529,
      { type: "error", error: { type: "overloaded_error", message: `echo of ${SECRET}` } },
      `echo of ${SECRET}`,
      new Headers({ "request-id": "req_busy" }),
    );
    __setAnthropicClient({ messages: { create: async () => { throw error; } } } as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await callClaude({ system: "s", grounding: "g", history: [], question: "q", maxTokens: 32 });
      throw new Error("callClaude resolved");
    } catch (caught) {
      expect(caught).toBeInstanceOf(AiError);
      const ai = caught as AiError;
      expect(ai.status).toBe(503);
      expect(ai.message).toBe("Bubbles is busy right now. Wait a moment and ask again. No answer was generated.");
      expect(ai.message).not.toContain(SECRET);
      expect(log.mock.calls.join("\n")).not.toContain(SECRET);
    } finally {
      log.mockRestore();
    }
  });
});

describe("required fields", () => {
  it("keeps a typed name that Woven does not have, and lists the empty intake lines", () => {
    const missing = missingRequiredFields(
      proposal({
        employeeName: "Test Employee",
        employeeVerification: { status: "unverified", title: null, reason: "not_found" },
      }),
      "Write a corrective action.",
    );
    expect(missing.map((item) => item.key)).not.toContain("employee_name");
    expect(missing.map((item) => item.key)).toEqual([
      "salon",
      "form_date",
      "what_happened",
      "warning_level",
      "previous_action",
      "payroll_deduct",
    ]);
    expect(missing.map((item) => item.key)).not.toContain("job_title");
    const sentence = requiredFieldSentence(missing);
    expect(sentence.startsWith("Still needed on the form:")).toBe(true);
    expect(sentence).toContain("Store");
    expect(sentence).not.toMatch(/woven|not verified/i);
  });

  it("does not list a name as missing when the only fact is that Woven has no match", () => {
    const missing = missingRequiredFields(
      proposal({
        employeeName: "Testy Testerson",
        locationId: "loc-264",
        formDate: "2026-10-23",
        issue: "Opened the store late.",
        warningLevel: "verbal",
        payrollDeduct: "no",
        employeeVerification: { status: "unverified", title: null, reason: "not_found" },
      }),
      "This is the first corrective action. Opened the store late.",
    );
    expect(missing.map((item) => item.key)).not.toContain("employee_name");
    expect(requiredFieldSentence(missing)).not.toContain("Testy Testerson");
  });

  it("leaves a coaching proposal alone", () => {
    expect(
      missingRequiredFields(proposal({ templateKey: "coaching", templateName: "Coaching", employeeName: null }), "Coaching for the team."),
    ).toEqual([]);
  });
});

describe("citation verification", () => {
  const chunks: CurrentManualChunk[] = [
    {
      documentId: "doc-current",
      section: "Standards of Conduct",
      page: 12,
      content: "Standards of Conduct\nEmployees follow the standards.",
    },
  ];

  it("keeps a heading and page that are in the current chunks", () => {
    const kept = keepVerifiedCitations(
      [
        {
          documentId: "doc-current",
          documentTitle: "JBA Policy Manual",
          locator: "Standards of Conduct, page 12",
          category: "policies_compliance",
          excerpt: "Standards of Conduct",
          relevance: 1,
        },
      ],
      chunks,
    );
    expect(kept).toHaveLength(1);
  });

  it("drops a page or an older edition that the current chunks do not contain", () => {
    const kept = keepVerifiedCitations(
      [
        {
          documentId: "doc-current",
          documentTitle: "JBA Policy Manual",
          locator: "Animals in the Workplace, page 30",
          category: "policies_compliance",
          excerpt: "Animals in the Workplace",
          relevance: 1,
        },
        {
          documentId: "doc-old-edition",
          documentTitle: "2025 JBA Policy Manual",
          locator: "Standards of Conduct, page 12",
          category: "policies_compliance",
          excerpt: "Standards of Conduct",
          relevance: 1,
        },
      ],
      chunks,
    );
    expect(kept).toEqual([]);
  });
});

describe("the stores table", () => {
  it("ignores a primed table while the flag is off", () => {
    primeStoreIndex(
      buildStoreIndex({
        stores: [
          {
            id: "loc-999",
            code: "999",
            name: "Widgetville, KS",
            state: "KS",
            districtId: null,
            districtName: null,
            regionId: null,
            regionName: null,
          },
        ],
      }),
    );
    expect(activeStoreIndex().stores.some((store) => store.id === "loc-999")).toBe(false);
    expect(resolveStoreText("Widgetville").kind).toBe("not_found");
  });

  it("reads the primed table when the flag is on", () => {
    process.env.STORES_TABLE_ENABLED = "yes";
    primeStoreIndex(
      buildStoreIndex({
        stores: [
          {
            id: "loc-999",
            code: "999",
            name: "Widgetville, KS",
            state: "KS",
            districtId: null,
            districtName: null,
            regionId: null,
            regionName: null,
          },
        ],
        extraAliases: [{ storeId: "loc-999", kind: "woven_name", text: "Woven Widgetville" }],
      }),
    );
    expect(resolveStoreText("Widgetville")).toMatchObject({ kind: "resolved", store: { id: "loc-999" } });
    expect(resolveStoreText("Woven Widgetville")).toMatchObject({ kind: "resolved", store: { id: "loc-999" } });
  });

  it("proposes the seven Buff City Soap stores and no invented Woven ids", () => {
    const sql = readFileSync("supabase/migrations/20261024001000_stores.sql", "utf8");
    expect(sql).toContain("Do not apply it");
    for (const store of COMPANY_LOCATION_ENTRIES) {
      expect(sql).toContain(`'loc-${store.code}'`);
      expect(sql).toContain(`'${store.name.replaceAll("'", "''")}'`);
      expect(sql).toContain(`'${store.state}'`);
    }
    expect(sql).not.toContain("woven_location_id");
    expect(COMPANY_LOCATION_ENTRIES).toHaveLength(7);
  });
});

describe("chat traces", () => {
  it("counts rewritten queries, empty retrieval, and turns with no form", () => {
    const sql = readFileSync("supabase/queries/chat_traces_weekly.sql", "utf8");
    expect(sql).toContain("rewritten_query is not null");
    expect(sql).toContain("retrieval_count = 0");
    expect(sql).toContain("form_in_progress = false");
    expect(sql).toContain("from public.chat_traces");
    const ask = readFileSync("src/lib/ai/server-ask.ts", "utf8");
    expect(ask).toContain("if (!chatTraceEnabled())");
    expect(readFileSync("src/app/api/forms/duplicate-create-route.test.ts", "utf8").length).toBeGreaterThan(0);
  });
});
