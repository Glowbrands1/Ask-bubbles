import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Change exit for jordan smith" with no form in the conversation: the form
 * on file is found among the ones this actor may see and put in the thread —
 * a finalized one as a new draft of it — and nothing new is ever created.
 * Ported from the reference platform's `chat-reopen.test.ts`; the people are
 * synthetic.
 */

type Row = {
  id: string;
  templateKey: string;
  templateName: string;
  employeeName: string;
  status: "draft" | "finalized" | "revised";
  createdAt: string;
  revisesInstanceId: string | null;
  events: { kind: string; detail: Record<string, unknown> }[];
};

type Reply = { content: string; formUpdate?: { instanceId: string; updated: string[] } };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  revised: [] as string[],
  listed: 0,
  filters: [] as unknown[],
  corrected: [] as string[],
  correction: null as null | Reply,
  policyChanged: [] as string[],
  policyChange: null as null | Reply,
  redrafted: [] as string[],
}));

const row = (overrides: Partial<Row>): Row => ({
  id: "exit-1",
  templateKey: "resignation-exit",
  templateName: "Resignation/Exit Form",
  employeeName: "Jordan Smith",
  status: "finalized",
  createdAt: "2026-10-01T12:00:00Z",
  revisesInstanceId: null,
  events: [],
  ...overrides,
});

vi.mock("./access", () => ({
  authorizeForms: async () => ({ id: "user-1", role: "location_manager", verified: true, visibility: null }),
}));

vi.mock("./instance-scope", () => ({
  authorizeInstance: async (_request: Request, id: string) => {
    const found = state.rows.find((entry) => entry.id === id);
    if (!found) throw new Error("No such form.");
    return { actor: { id: "user-1" }, loaded: { instance: found, events: found.events } };
  },
  instanceListFilterFor: () => undefined,
  visibleInstances: (_actor: unknown, rows: Row[]) => rows,
}));

vi.mock("./instances", () => ({
  listInstances: async (_view: string, _limit: number, filter: unknown) => {
    state.listed += 1;
    state.filters.push(filter);
    return state.rows;
  },
  // The original is left as it is: it is replaced when the revision is finalized.
  findOpenRevision: async (id: string) =>
    state.rows.find((entry) => entry.revisesInstanceId === id && entry.status === "draft") ?? null,
  reviseInstance: async (id: string) => {
    state.revised.push(id);
    const revision = row({
      id: `${id}-rev`,
      status: "draft",
      revisesInstanceId: id,
      createdAt: "2026-10-20T12:00:00Z",
    });
    state.rows.push(revision);
    return revision;
  },
}));

vi.mock("./repository", () => ({
  getTemplateByKey: async (key: string) =>
    key === "resignation-exit" ? { key, name: "Resignation/Exit Form" } : null,
}));

const answered = (reply: Reply | null) =>
  reply ? { citations: [], coverage: "not_applicable", ...reply } : null;

vi.mock("./chat-correction", () => ({
  correctActiveForm: async (input: { instanceId: string }) => {
    state.corrected.push(input.instanceId);
    return answered(state.correction);
  },
}));
vi.mock("./chat-policy-change", () => ({
  changeActiveFormPolicy: async (input: { instanceId: string }) => {
    state.policyChanged.push(input.instanceId);
    return answered(state.policyChange);
  },
}));
vi.mock("./chat-revision", () => ({
  reviseActiveForm: async (input: { instanceId: string }) => {
    state.redrafted.push(input.instanceId);
    return null;
  },
}));

const { reopenRequestedForm } = await import("./chat-reopen");

const ask = (question: string, activeInstanceId?: string) =>
  reopenRequestedForm({
    request: new Request("http://localhost/api/chat"),
    question,
    history: [],
    today: "2026-10-20",
    activeInstanceId,
  });

beforeEach(() => {
  state.rows = [row({})];
  state.revised = [];
  state.listed = 0;
  state.filters = [];
  state.corrected = [];
  state.correction = null;
  state.policyChanged = [];
  state.policyChange = null;
  state.redrafted = [];
});

describe("bringing a form on file back into the conversation", () => {
  it("opens a finalized exit form as a new draft, in the thread", async () => {
    const response = await ask("change exit for jordan smith");
    expect(state.revised).toEqual(["exit-1"]);
    expect(response!.formOpened).toEqual({
      instanceId: "exit-1-rev",
      templateName: "Resignation/Exit Form",
      revisesInstanceId: "exit-1",
    });
    expect(response!.content).toContain(
      "The **Resignation/Exit Form** for **Jordan Smith** was finalized, so I opened a new draft of it",
    );
    expect(response!.content).toContain("Edit anything that needs changing below");
  });

  it("makes the change the same sentence asked for, on the new draft", async () => {
    state.correction = {
      content: "Updated the **Resignation/Exit Form** for **Jordan Smith**: Date that notice was given → 09/27/2026.",
      formUpdate: { instanceId: "exit-1-rev", updated: ["notice_given_date"] },
    };
    const response = await ask("duplicate exit for jordan smith and change date notice given to 9-27-26");
    expect(state.corrected).toEqual(["exit-1-rev"]);
    expect(response!.content).toContain("Date that notice was given → 09/27/2026");
    expect(response!.formUpdate).toEqual({ instanceId: "exit-1-rev", updated: ["notice_given_date"] });
    expect(response!.formOpened!.instanceId).toBe("exit-1-rev");
  });

  it("names a policy from the manual on the new draft when the sentence asks for one", async () => {
    state.rows = [row({ id: "ca-1", templateKey: "dpoa", templateName: "Corrective Action Form", employeeName: "Avery Stone" })];
    state.policyChange = {
      content: "Updated Direct policy on the **Corrective Action Form** for **Avery Stone**.",
      formUpdate: { instanceId: "ca-1-rev", updated: ["policy_language", "action_plan"] },
    };
    const response = await ask("edit the CA for Avery Stone and add the attendance policy");
    expect(state.revised).toEqual(["ca-1"]);
    expect(state.corrected).toEqual(["ca-1-rev"]);
    expect(state.policyChanged).toEqual(["ca-1-rev"]);
    expect(state.redrafted).toEqual([]);
    expect(response!.formUpdate).toEqual({ instanceId: "ca-1-rev", updated: ["policy_language", "action_plan"] });
  });

  it("opens a draft as it is, without revising anything", async () => {
    state.rows = [row({ status: "draft" })];
    const response = await ask("edit the exit form for Jordan Smith");
    expect(state.revised).toEqual([]);
    expect(response!.formOpened).toEqual({
      instanceId: "exit-1",
      templateName: "Resignation/Exit Form",
      revisesInstanceId: null,
    });
    expect(response!.content).toContain("is still a draft");
  });

  it("asking twice lands on the draft the first request opened", async () => {
    await ask("change exit for jordan smith");
    const second = await ask("change exit for jordan smith");
    expect(state.revised).toEqual(["exit-1"]);
    expect(second!.formOpened!.instanceId).toBe("exit-1-rev");
    // The finalized original is untouched until that draft is finalized.
    expect(state.rows.find((entry) => entry.id === "exit-1")!.status).toBe("finalized");
  });

  it("asking from the original's own card lands on its open draft too", async () => {
    await ask("change exit for jordan smith");
    const again = await ask("edit the exit form", "exit-1");
    expect(state.revised).toEqual(["exit-1"]);
    expect(again!.formOpened!.instanceId).toBe("exit-1-rev");
  });

  it("follows a revised form in the conversation to its newer version", async () => {
    state.rows = [
      row({ status: "revised", events: [{ kind: "revised", detail: { revisionId: "exit-2" } }] }),
      row({ id: "exit-2", status: "draft", revisesInstanceId: "exit-1" }),
    ];
    const response = await ask("change the exit form", "exit-1");
    expect(state.revised).toEqual([]);
    expect(response!.formOpened!.instanceId).toBe("exit-2");
    expect(response!.content).toContain("already has a new draft open — here it is");
  });

  it("chooses the named employee's newest form, not somebody else's", async () => {
    state.rows = [
      row({ id: "exit-old", createdAt: "2026-08-01T12:00:00Z" }),
      row({ id: "exit-new", createdAt: "2026-10-01T12:00:00Z" }),
      row({ id: "exit-other", employeeName: "Jane Doe", createdAt: "2026-10-10T12:00:00Z" }),
      row({ id: "coaching-1", templateKey: "coaching", templateName: "Coaching Form", createdAt: "2026-10-15T12:00:00Z" }),
    ];
    const response = await ask("change exit for Jordan Smith");
    expect(state.revised).toEqual(["exit-new"]);
    expect(response!.formOpened!.revisesInstanceId).toBe("exit-new");
  });

  it("reads the forms on file narrowed by the name, as the Forms Register lookup does", async () => {
    await ask("change exit for Jordan Smith");
    expect(state.filters).toEqual([{ employeeNameWords: ["Jordan", "Smith"] }]);
  });

  it("shows a finalized form as it is when asked to see it", async () => {
    const response = await ask("show draft of exit", "exit-1");
    expect(state.revised).toEqual([]);
    expect(response!.formOpened).toEqual({
      instanceId: "exit-1",
      templateName: "Resignation/Exit Form",
      revisesInstanceId: null,
    });
    expect(response!.content).toContain("Edit as new draft");
  });

  it("says so when the named employee has no such form on file", async () => {
    state.rows = [];
    const response = await ask("change exit for Morgan Lee");
    expect(state.revised).toEqual([]);
    expect(response!.formOpened).toBeUndefined();
    expect(response!.content).toContain("couldn't find a **Resignation/Exit Form** for **Morgan Lee**");
    expect(response!.content).toContain("Forms → Forms Register");
  });

  it("leaves a proposal still waiting to be created to the proposal flow", async () => {
    const response = await reopenRequestedForm({
      request: new Request("http://localhost/api/chat"),
      question: "change the exit form for Jordan Smith",
      history: [],
      today: "2026-10-20",
      continuingTemplateKey: "resignation-exit",
    });
    expect(response).toBeNull();
    expect(state.revised).toEqual([]);
  });

  it.each(["create exit for Jordan Smith", "how do I change an exit form?", "what is the dress code?"])(
    "leaves %s to the ordinary flow",
    async (question) => {
      expect(await ask(question)).toBeNull();
      expect(state.listed).toBe(0);
      expect(state.revised).toEqual([]);
    },
  );
});
