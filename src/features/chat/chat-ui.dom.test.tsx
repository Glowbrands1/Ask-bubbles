// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHAT_UI_FLAG_NAMES } from "@/lib/config/chat-ui-flags";
import type { ChatFormProposal, ChatMessage } from "@/types";

import { MessageBubble } from "./message-bubble";
import { ResumeDraftBanner } from "./resume-draft-banner";

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({ user: { avatarInitials: "PC", name: "Pau" }, isAdmin: false, role: null, managerDisplayName: "Pau" }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const FLAGS = [...CHAT_UI_FLAG_NAMES];

function proposal(): ChatFormProposal {
  return {
    proposalId: "p1",
    templateKey: "dpoa",
    templateName: "Corrective Action",
    supportsInlineDraft: false,
    variantKey: null,
    employeeName: "Test Employee",
    employeeRole: null,
    locationId: null,
    locationName: null,
    locationResolution: "needs_selection",
    authorizedLocationIds: [],
    status: "needs_employee",
    sourceMessageIds: [],
    employeeVerification: { status: "unverified", title: null, reason: "not_found" },
  };
}

function message(): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "Here is the corrective action.",
    createdAt: "2026-10-24T12:00:00Z",
    mode: "standard",
    coverage: "not_applicable",
    formProposal: proposal(),
    citations: [
      {
        documentId: "doc-current",
        documentTitle: "JBA Policy Manual",
        locator: "Standards of Conduct, page 12",
        category: "policies_compliance",
        excerpt: "Standards of Conduct",
        relevance: 1,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  for (const name of FLAGS) delete process.env[name];
  vi.unstubAllGlobals();
});

describe("the chat UI is unchanged while the flags are off", () => {
  it("shows the source list and the typed name, and none of the new controls", () => {
    const view = render(<MessageBubble message={message()} onSuggestion={() => {}} />);
    expect(view.container.querySelector("[data-chat-ui]")).toBeNull();
    expect(view.container.querySelector("[tabindex]")).toBeNull();
    expect(screen.getByText("Test Employee")).toBeTruthy();
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(screen.queryByText("Verbal warning")).toBeNull();
    expect(screen.queryByLabelText("Form fields")).toBeNull();
    expect(screen.getByText("Not verified — no matching employee in Woven")).toBeTruthy();
  });
});

describe("the chat UI flags turn the new controls on", () => {
  it("lists the typed name as filled, and offers edits, chips, and quick replies", () => {
    for (const name of FLAGS) process.env[name] = "1";
    const view = render(<MessageBubble message={message()} onSuggestion={() => {}} />);
    expect(screen.getByLabelText("Form fields").textContent).toContain("Filled: Employee's full name");
    expect(screen.getByLabelText("Form fields").textContent).toContain("Missing: Store");
    expect(screen.getByLabelText("Form fields").textContent).not.toMatch(/not verified/i);
    expect(screen.getByLabelText("Employee")).toHaveProperty("value", "Test Employee");
    expect(screen.getByRole("link", { name: "Standards of Conduct · p. 12" }).getAttribute("href")).toBe(
      "/knowledge/document/doc-current",
    );
    expect(screen.queryByText("Sources")).toBeNull();
    expect(screen.getByRole("button", { name: "Verbal warning" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Payroll deduct: no" })).toBeTruthy();
    expect(view.container.querySelector("[tabindex='-1']")).toBeTruthy();
  });

  it("shows a resume banner from the saved draft", async () => {
    process.env.NEXT_PUBLIC_RESUME_DRAFT_ENABLED = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ draft: { employeeName: "Test Employee", store: "Omaha, NE (West Dodge Rd)", warningLevel: null } }),
      ),
    );
    render(<ResumeDraftBanner conversationId="conv-1" onContinue={() => {}} />);
    expect(await screen.findByText(/Resume the draft for Test Employee at Omaha, NE \(West Dodge Rd\)/)).toBeTruthy();
  });
});
