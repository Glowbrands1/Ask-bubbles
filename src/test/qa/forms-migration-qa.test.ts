import { readFileSync } from "node:fs";

import { extractText, getDocumentProxy } from "unpdf";
import { beforeEach, describe, expect, it, vi } from "vitest";

import approved from "@/test/fixtures/approved-template-changes.json";
import rendered from "@/test/fixtures/ask-sunny-rendered-forms.json";
import jbaChunks from "@/test/fixtures/jba-manual-brand-chunks.json";
import snapshot from "@/test/fixtures/ask-sunny-published-templates.json";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE FORMS MIGRATION QA: SEVENTEEN CHECKS ON EACH OF THE SEVENTEEN FORMS
 * ============================================================================
 *
 * The brief's QA list (Phase 2, section 13), run form by form. Each test is
 * named "<form> · NN <check>", so the run IS the parity matrix.
 *
 * Real: the migrated library as `ensureTemplateLibrary` installs it, the chat
 * proposal path, the forms API routes, chat revision, the PDF renderer, the
 * permission matrix and the JBA brand reading. Faked: the database (the
 * in-memory store the forms suite uses), the identity provider, the model
 * (its tool calls return what each test sets) and the knowledge provider.
 *
 * Every person is synthetic. The reference values come from the reference
 * platform's own database (`ask-sunny-published-templates.json`) and its own
 * renderer (`ask-sunny-rendered-forms.json`), both read without employee data.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

const state = vi.hoisted(() => ({
  role: "location_manager",
  scope: null as unknown,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revise: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  calls: [] as { tool: string }[],
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

vi.mock("@/lib/api/respond", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/respond")>()),
  assertLiveMode: () => {},
  assertNoConfigurationProblems: () => {},
  assertWithinRateLimit: () => {},
}));

vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, state.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.com",
          displayName: "QA Manager",
          role: state.role,
          scope: state.scope,
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice: { name: string } }) => {
        const tool = request.tool_choice.name;
        state.calls.push({ tool });
        return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: tool, input: tool === "revise_form_fields" ? state.revise : state.draft }],
        };
      },
    },
  }),
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      return [];
    }
    async fetchRoleGrounding(role: { id: string }) {
      return {
        ok: true,
        grounding: {
          role: { id: role.id },
          documentId: "doc-pm",
          documentTitle: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            {
              chunk_id: "pm-0",
              document_id: "doc-pm",
              document_title: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
              category: "leadership_coaching",
              locator: "SECTION 2",
              page: null,
              section: null,
              content: "Solve the issue at the lowest appropriate level.",
              similarity: 0,
            },
          ],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "not needed" };
    }
  },
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return { ...actual, loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster([], scope) };
});

const { ensureTemplateLibrary, getTemplateByKey, getCurrentVersion, listTemplateSummaries, listVersions, openDraft, saveDraft, publishDraft } =
  await import("@/lib/forms/repository");
const { MIGRATED_TEMPLATE_SEEDS, TEMPLATE_SEEDS } = await import("@/lib/forms/library");
const { checkboxGroupsForVariant, fieldsForVariant, interpolate, parseFormDocument } = await import("@/lib/forms/document");
const { draftableFields, enforceResponsibilities } = await import("@/lib/forms/responsibility");
const { renderFormPdf } = await import("@/lib/forms/pdf-render");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const { reviseActiveForm } = await import("@/lib/forms/chat-revision");
const { correctActiveForm } = await import("@/lib/forms/chat-correction");
const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
const { COMPANY_FORM_CATEGORIES, FORM_LAYOUT_FAMILIES } = await import("@/config/company/forms/categories");
const { RETIRED_TEMPLATE_KEYS } = await import("@/config/company/forms/retired");
const { POLICY_MANUAL_BRAND_SCOPE } = await import("@/config/company/knowledge");
const { readManualForBrand } = await import("@/lib/knowledge/brand-sections");
const instancesRoute = await import("@/app/api/forms/instances/route");
const instanceRoute = await import("@/app/api/forms/instances/[id]/route");
const draftRoute = await import("@/app/api/forms/instances/[id]/draft/route");
const pdfRoute = await import("@/app/api/forms/instances/[id]/pdf/route");

/* ------------------------------------------------------------- the forms --- */

type Role = "location_manager" | "district_manager";

/**
 * HOW AN EXISTING DRAFT IS EDITED, exactly as the reference platform does it:
 *
 *   revision   the coaching-family documents (Coaching, Follow-Up Coaching,
 *              Demotion, Position Transfer): "change the … to …" in chat
 *              rewrites the field (`chat-revision.ts`);
 *   payroll    the Corrective Action Form: its payroll-deduct answer is taken
 *              from chat (`chat-correction.ts`);
 *   exit       the Resignation/Exit Form: stated facts — rehire, last day —
 *              are taken from chat (`chat-correction.ts`);
 *   editor     Policy Review, the EPPs and the hiring forms: the reference
 *              platform edits these in the form editor, not through chat. The
 *              check is that a chat edit leaves the draft alone (no change, no
 *              second form) and the editor's save edits it.
 */
type EditKind = "revision" | "payroll" | "exit" | "editor";

interface QaForm {
  key: string;
  /** How a manager asks for it. */
  phrase: string;
  /** Who creates it. */
  creator: Role;
  /** Drafted fields the model writes on creation (the AI chips exercised). Empty: none on this form. */
  edits: readonly string[];
  edit: EditKind;
}

const FORMS: readonly QaForm[] = [
  { key: "coaching", phrase: "Create a coaching form for Jordan Testperson. She was late today.", creator: "location_manager", edits: ["other_topic", "coaching_details"], edit: "revision" },
  { key: "follow-up-coaching", phrase: "Create a follow-up coaching form for Jordan Testperson on punctuality. I followed up today and she has improved.", creator: "location_manager", edits: ["original_topic", "original_expectation"], edit: "revision" },
  { key: "dpoa", phrase: "Create a corrective action for Jordan Testperson. She was 20 minutes late today.", creator: "location_manager", edits: ["other_offense", "observation"], edit: "payroll" },
  { key: "policy-review", phrase: "Create a policy review for Jordan Testperson about the dress code.", creator: "location_manager", edits: ["topic", "observation"], edit: "editor" },
  { key: "sdit-epp", phrase: "Create an SDIT EPP for Jordan Testperson.", creator: "district_manager", edits: ["where_succeeding", "needs_improvement"], edit: "editor" },
  { key: "tsd-epp", phrase: "Create a TSD EPP for Jordan Testperson.", creator: "district_manager", edits: ["where_succeeding", "needs_improvement"], edit: "editor" },
  { key: "asd-sdit-epp", phrase: "Create an ASD-SDIT Performance EPP for Jordan Testperson.", creator: "district_manager", edits: ["where_succeeding", "needs_improvement"], edit: "editor" },
  { key: "fttc-epp", phrase: "Create an FTTC Performance EPP for Jordan Testperson.", creator: "district_manager", edits: ["where_succeeding", "needs_improvement"], edit: "editor" },
  { key: "dmit-epp-tsd", phrase: "Create a DMIT EPP TSD review for Jordan Testperson.", creator: "district_manager", edits: ["where_succeeding", "needs_improvement"], edit: "editor" },
  { key: "dmit-epp-dmit", phrase: "Create a DMIT EPP DMIT review for Jordan Testperson.", creator: "district_manager", edits: ["where_succeeding", "needs_improvement"], edit: "editor" },
  { key: "resignation-exit", phrase: "Create an exit form for Jordan Testperson. She gave two weeks notice on 9/1 and her last day was 9/15.", creator: "location_manager", edits: ["details", "details"], edit: "exit" },
  { key: "demotion", phrase: "Create a demotion form for Jordan Testperson, from manager to sales associate effective 10/12.", creator: "location_manager", edits: ["reason", "reason"], edit: "revision" },
  { key: "position-transfer", phrase: "Create a position transfer form for Jordan Testperson, transferring from store 12 to store 18.", creator: "location_manager", edits: ["reason", "reason"], edit: "revision" },
  { key: "prescreen-phone-interview", phrase: "Create a prescreen phone interview form for Jordan Testperson.", creator: "location_manager", edits: [], edit: "editor" },
  { key: "tanning-consultant-interview", phrase: "Create a tanning consultant interview form for Jordan Testperson.", creator: "location_manager", edits: [], edit: "editor" },
  { key: "management-interview-round-1", phrase: "Create a first round management interview form for Jordan Testperson.", creator: "location_manager", edits: [], edit: "editor" },
  { key: "management-interview-round-2", phrase: "Create a second round management interview form for Jordan Testperson.", creator: "location_manager", edits: [], edit: "editor" },
];

/*
 * What a chat edit asks for. Plain lower-case sentences: a capitalised phrase
 * reads as a person's name, and a change "about someone else" is rightly left
 * alone by the revision path.
 */
const REVISION_ONE = "greets every guest promptly and warmly at the counter.";
const REVISION_TWO = "keeps the counter organised and stocked during every shift.";

const SOURCE_KEY: Readonly<Record<string, string>> = { "resignation-exit": "stc-exit" };
const LOCATION_SCOPE = { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] };

interface SnapshotTemplate {
  key: string;
  publishedVersion: number;
  requiredPermission: string;
  category: string;
  displayOrder: number;
  layoutFamily: string;
  document: unknown;
  variants: { key: string }[];
  [field: string]: unknown;
}
const SOURCE = new Map((snapshot.templates as unknown as SnapshotTemplate[]).map((entry) => [entry.key, entry]));
const sourceOf = (key: string) => SOURCE.get(SOURCE_KEY[key] ?? key)!;
const seedOf = (key: string) => MIGRATED_TEMPLATE_SEEDS.find((seed) => seed.key === key)!;

/** The approved substitutions, applied to text from either side. */
const neutral = (text: string) =>
  text
    .replace(/SUN TAN CITY/g, "BUFF CITY SOAP")
    .replace(/Sun Tan City/g, "Buff City Soap")
    .replace(/Ask Sunny/g, "Ask Bubbles")
    .replace(/\s+/g, " ")
    .trim();

/** The two hiring-form lines retained verbatim for the business's review. */
const RETAINED_FOR_REVIEW = [
  "Are you willing to use our services as part of your Sun Tan City uniform? (Must agree to UV, Sunless and Spa usage to proceed with employment)",
  "Sun Tan City Core Values",
];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => strings(entry, out));
  return out;
}

function differences(a: unknown, b: unknown, path: string, out: { path: string; from: unknown; to: unknown }[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      differences(left[key], right[key], `${path}${Array.isArray(a) ? `[${key}]` : `.${key}`}`, out);
    }
    return;
  }
  out.push({ path, from: a ?? null, to: b ?? null });
}

/** A document's shape: every block's kind and keys, nothing a branding change touches. */
function skeleton(raw: unknown, variantKey: string | null) {
  const document = parseFormDocument(raw);
  return {
    blocks: document.blocks.map((block) => block.kind),
    fields: fieldsForVariant(document, variantKey).map((field) => [field.key, field.input, field.responsibility]),
    groups: checkboxGroupsForVariant(document, variantKey).map((group) => [group.key, group.options.map((option) => option.key)]),
    signatures: document.blocks.filter((block) => block.kind === "signature_row").length,
  };
}

/** The synthetic values the reference rendering used. */
function syntheticValues(document: ReturnType<typeof parseFormDocument>, variantKey: string | null) {
  const values: Record<string, string> = {};
  for (const field of fieldsForVariant(document, variantKey)) {
    values[field.key] = field.input === "date" ? "2026-10-01" : `Sample ${field.key.replace(/_/g, " ")}`;
  }
  const checked: Record<string, string[]> = {};
  for (const group of checkboxGroupsForVariant(document, variantKey)) {
    checked[group.key] = group.options.length > 0 ? [group.options[0]!.key] : [];
  }
  return { values, checked };
}

async function pdfText(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: text.replace(/\s+/g, " ").trim(), pages: totalPages };
}

/* --------------------------------------------------------------- helpers --- */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  joinOverview();
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? "2026-10-01",
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

async function values(id: string) {
  joinOverview();
  const response = await instanceRoute.GET(new Request(`https://app.test/api/forms/instances/${id}`), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { values: { fieldKey: string; value: string | null; checked: string[]; filledBy: string }[] };
  return Object.fromEntries(body.values.map((row) => [row.fieldKey, { value: row.value, checked: row.checked, by: row.filledBy }]));
}

let turn = 0;
const said = (content: string): ChatMessage => ({ id: `m-${(turn += 1)}`, role: "user", content, createdAt: "2026-10-01T15:00:00Z" });

function actAs(role: string) {
  state.role = role;
  state.scope = LOCATION_SCOPE;
}

/** The form as chat creates it: the proposal, then the create, then the draft. */
async function createViaChat(form: QaForm) {
  actAs(form.creator);
  const seed = seedOf(form.key);
  const document = parseFormDocument(seed.document);
  const variantKey = seed.variants[0]?.key ?? null;
  state.draft = {
    values: Object.fromEntries(form.edits.map((key) => [key, `Drafted ${key.replace(/_/g, " ")} for the QA run.`])),
    checked: {},
  };
  const messages = [said(form.phrase)];
  const reply = await proposeFormForTurn({
    history: [],
    question: form.phrase,
    questionMessageId: messages[0]!.id,
    actor: { role: form.creator as never, scope: LOCATION_SCOPE as AccessScope },
    summaries: await listTemplateSummaries(),
    today: "2026-10-01",
  });
  const proposal = reply?.formProposal;
  expect(proposal?.templateKey, reply?.content).toBe(form.key);
  let id: string;
  if (proposal!.supportsInlineDraft) {
    const created = await createInlineForm({ proposal: proposal!, messages, call, onCreated: () => {} });
    id = created.reference.instanceId;
  } else {
    const created = await call<{ instance: { id: string } }>("/api/forms/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateKey: proposal!.templateKey,
        employeeName: proposal!.employeeName,
        variantKey: proposal!.variantKey,
        locationId: proposal!.locationId,
        source: "assistant",
        conversation: messages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
      }),
    });
    id = created.instance.id;
  }
  // Where chat does not draft inline (as on the reference platform for some
  // EPPs), the draft is requested the way the form page requests it.
  if (form.edits.length > 0 && !state.calls.some((entry) => entry.tool === "write_form_fields")) {
    await call(`/api/forms/instances/${id}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: form.phrase }),
    });
  }
  const history: ChatMessage[] = [
    ...messages,
    {
      id: `a-${(turn += 1)}`,
      role: "assistant",
      content: "Here is the form.",
      createdAt: "2026-10-01T15:00:00Z",
      formInstanceRef: { instanceId: id, proposalId: proposal!.proposalId, templateName: proposal!.templateName },
    } as ChatMessage,
  ];
  return { id, history, document, variantKey, proposal: proposal! };
}

const chatRequest = () => new Request("https://app.test/api/chat", { method: "POST" });

/** What the chat route tries on an open form, in its order: correction, then revision. */
async function chatTurn(id: string, history: ChatMessage[], question: string) {
  const corrected = await correctActiveForm({ request: chatRequest(), instanceId: id, question, today: "2026-10-01" });
  if (corrected) return corrected;
  return reviseActiveForm({ request: chatRequest(), instanceId: id, question, history, today: "2026-10-01" });
}

interface EditOutcome {
  key: string;
  expect: (row: { value: string | null; checked: string[] } | undefined) => void;
}

/** The fields an editor-only form's save changes: its drafted fields, else its first two manager lines. */
function editorFields(form: QaForm, document: ReturnType<typeof parseFormDocument>, variantKey: string | null): [string, string] {
  if (form.edits.length >= 2) return [form.edits[0]!, form.edits[1]!];
  const own = fieldsForVariant(document, variantKey).filter((field) => field.responsibility === "manager" && field.input !== "date");
  return [own[0]!.key, (own[1] ?? own[0])!.key];
}

/**
 * Edit step 0 or 1 of a form's existing draft, by the form's own route. A
 * revision asks the model for the named field AND an unrequested rewrite of
 * another, which must not land.
 */
async function editStep(
  form: QaForm,
  created: Awaited<ReturnType<typeof createViaChat>>,
  step: 0 | 1,
): Promise<EditOutcome> {
  const { id, history, document, variantKey } = created;
  if (form.edit === "revision") {
    const key = form.edits[step]!;
    const text = step === 0 ? REVISION_ONE : REVISION_TWO;
    const other = form.edits.find((candidate) => candidate !== key) ?? null;
    state.revise = { values: { [key]: text, ...(other ? { [other]: "UNREQUESTED REWRITE" } : {}) } };
    const response = await chatTurn(id, history, `Change the ${labelOf(document, variantKey, key)} to: ${text}`);
    expect(response?.formUpdate?.instanceId, response?.content).toBe(id);
    return { key, expect: (row) => expect(row?.value).toContain(text.slice(0, 30)) };
  }
  if (form.edit === "payroll") {
    const answer = step === 0 ? "yes" : "no";
    const response = await chatTurn(id, history, step === 0 ? "change payroll deduct to yes" : "actually, no payroll deduction");
    expect(response?.formUpdate?.instanceId, response?.content).toBe(id);
    return { key: "payroll_deduct", expect: (row) => expect(row?.checked).toEqual([answer]) };
  }
  if (form.edit === "exit") {
    if (step === 0) {
      const response = await chatTurn(id, history, "Not eligible for rehire.");
      expect(response?.formUpdate?.instanceId, response?.content).toBe(id);
      return { key: "eligible_for_rehire", expect: (row) => expect(row?.checked).toEqual(["no"]) };
    }
    const response = await chatTurn(id, history, "Her last day was actually 9/18.");
    expect(response?.formUpdate?.instanceId, response?.content).toBe(id);
    return { key: "last_day_worked", expect: (row) => expect(row?.value).toBe("2026-09-18") };
  }
  // The editor: chat leaves the draft as it is, as on the reference platform…
  const before = await values(id);
  expect(await chatTurn(id, history, `Change the notes to: ${REVISION_ONE}`)).toBeNull();
  expect(await values(id)).toEqual(before);
  expect(store.form_instances).toHaveLength(1);
  // …and the form editor's save edits it.
  const key = editorFields(form, document, variantKey)[step];
  const text = step === 0 ? REVISION_ONE : REVISION_TWO;
  joinOverview();
  const response = await instanceRoute.PATCH(
    new Request(`https://app.test/api/forms/instances/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { [key]: text }, checked: {} }),
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
  return { key, expect: (row) => expect(row?.value).toBe(text) };
}

const labelOf = (document: ReturnType<typeof parseFormDocument>, variantKey: string | null, key: string) => {
  const variant = FORMS_VARIANTS.get(variantKey ?? "") ?? null;
  const field = fieldsForVariant(document, variantKey).find((entry) => entry.key === key)!;
  return interpolate(field.label, variant as never);
};
const FORMS_VARIANTS = new Map(
  MIGRATED_TEMPLATE_SEEDS.flatMap((seed) => seed.variants.map((variant) => [variant.key, variant] as const)),
);

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.draft = {};
  state.revise = {};
  state.calls = [];
  turn = 0;
  actAs("location_manager");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

/* ------------------------------------------------------------ the matrix --- */

describe.each(FORMS)("$key", (form) => {
  const seed = seedOf(form.key);
  const source = sourceOf(form.key);
  const variantKeys = seed.variants.length > 0 ? seed.variants.map((variant) => variant.key) : [null];

  it(`${form.key} · 01 the correct template loads`, async () => {
    const template = await getTemplateByKey(form.key);
    expect(template?.active).toBe(true);
    const current = await getCurrentVersion(template!.id);
    expect(current?.status).toBe("published");
    expect(current?.document).toEqual(parseFormDocument(seed.document));
    expect((await listTemplateSummaries()).map((summary) => summary.key)).toContain(form.key);
  });

  it(`${form.key} · 02 content matches the latest published reference version, except approved branding`, () => {
    const comparable = (entry: Record<string, unknown>) => ({
      name: entry.name,
      shortName: entry.shortName,
      description: entry.description,
      category: entry.category,
      layoutFamily: entry.layoutFamily,
      requiredPermission: entry.requiredPermission,
      displayOrder: entry.displayOrder,
      document: entry.document,
      variants: entry.variants,
    });
    const found: { path: string; from: unknown; to: unknown }[] = [];
    differences(comparable(source), comparable(seed as never), "", found);
    const allowed = (approved.changes as { sourceKey: string; path: string }[])
      .filter((change) => change.sourceKey === source.key)
      .map((change) => change.path);
    for (const change of found) expect(allowed, change.path).toContain(change.path);
  });

  it(`${form.key} · 03 all sections and fields are preserved`, () => {
    for (const variantKey of variantKeys) {
      expect(skeleton(seed.document, variantKey), String(variantKey)).toEqual(skeleton(source.document, variantKey));
    }
    expect(seed.variants.map((variant) => variant.key)).toEqual(source.variants.map((variant) => variant.key));
  });

  it(`${form.key} · 04 AI-fill chips map to the same fields, and the drafting writes them`, async () => {
    for (const variantKey of variantKeys) {
      const ours = draftableFields(parseFormDocument(seed.document), variantKey).map((field) => field.key);
      expect(ours).toEqual(draftableFields(parseFormDocument(source.document), variantKey).map((field) => field.key));
      // Only the AI fields accept a drafted value; everything else is refused.
      const document = parseFormDocument(seed.document);
      const everything = Object.fromEntries(fieldsForVariant(document, variantKey).map((field) => [field.key, "x"]));
      const enforced = enforceResponsibilities(document, variantKey, { values: everything, checked: {} });
      expect(Object.keys(enforced.values).sort()).toEqual([...ours].sort());
    }
    if (form.edits.length === 0) return;
    const { id } = await createViaChat(form);
    const read = await values(id);
    expect(read[form.edits[0]!]?.value ?? "", "the drafted field was written").not.toBe("");
    expect(read[form.edits[0]!]?.by).toBe("ai");
  });

  it(`${form.key} · 05 chat correctly creates the form`, async () => {
    const { id, proposal } = await createViaChat(form);
    expect(proposal.employeeName).toBe("Jordan Testperson");
    const row = store.form_instances.find((entry) => entry.id === id)!;
    const template = store.form_templates!.find((entry) => entry.id === row.template_id)!;
    expect(template.key).toBe(form.key);
    expect(row.source).toBe("assistant");
    expect(store.form_instances).toHaveLength(1);
  });

  it(`${form.key} · 06 an existing draft can be edited (${form.edit === "editor" ? "form editor, as on the reference platform" : "through chat"})`, async () => {
    const created = await createViaChat(form);
    const outcome = await editStep(form, created, 0);
    outcome.expect((await values(created.id))[outcome.key]);
    expect(store.form_instances).toHaveLength(1);
  });

  it(`${form.key} · 07 follow-up corrections persist`, async () => {
    const created = await createViaChat(form);
    const first = await editStep(form, created, 0);
    const second = await editStep(form, created, 1);
    const read = await values(created.id);
    second.expect(read[second.key]);
    if (first.key !== second.key) first.expect(read[first.key]);
    expect(store.form_instances).toHaveLength(1);
  });

  it(`${form.key} · 08 unrelated fields remain unchanged`, async () => {
    const created = await createViaChat(form);
    const before = await values(created.id);
    const outcome = await editStep(form, created, 0);
    const after = await values(created.id);
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (field === outcome.key) continue;
      expect(after[field], field).toEqual(before[field]);
    }
  });

  it(`${form.key} · 09 the PDF preview renders`, async () => {
    const { id } = await createViaChat(form);
    joinOverview();
    const response = await pdfRoute.GET(new Request(`https://app.test/api/forms/instances/${id}/pdf`), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const { text, pages } = await pdfText(new Uint8Array(await response.arrayBuffer()));
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(text).toContain("Jordan Testperson");
  });

  it(`${form.key} · 10 generated PDFs preserve the reference layout and content`, async () => {
    const reference = rendered.forms as Record<string, { pages: number; text: string }>;
    for (const variant of seed.variants.length > 0 ? seed.variants : [null]) {
      const document = parseFormDocument(seed.document);
      const name = `${form.key}${variant ? `__${variant.key}` : ""}`;
      const bytes = renderFormPdf(document, variant as never, syntheticValues(document, variant?.key ?? null), {
        templateName: seed.name,
        templateVersion: 1,
        employeeName: "Avery Testperson",
        formDate: "2026-10-01",
        locationName: "Test Location 1",
        reference: "qa-0001",
        status: "finalized",
      });
      const ours = await pdfText(bytes);
      expect(ours.pages, name).toBe(reference[name]!.pages);
      expect(neutral(ours.text), name).toBe(neutral(reference[name]!.text));
    }
  });

  it(`${form.key} · 11 signature fields behave correctly`, () => {
    for (const variantKey of variantKeys) {
      const document = parseFormDocument(seed.document);
      const rows = document.blocks.filter((block) => block.kind === "signature_row");
      expect(rows.length).toBe(skeleton(source.document, variantKey).signatures);
      // A signature line carries no field: nothing can be drafted or saved onto it.
      const keys = new Set(fieldsForVariant(document, variantKey).map((field) => field.key));
      for (const label of strings(rows)) expect(keys.has(label)).toBe(false);
      const signatureKeys = ["employee_signature", "supervisor_signature", "manager_signature", "signature"];
      const enforced = enforceResponsibilities(document, variantKey, {
        values: Object.fromEntries(signatureKeys.map((key) => [key, "Signed"])),
        checked: {},
      });
      expect(enforced.values).toEqual({});
    }
  });

  it(`${form.key} · 12 template versioning works`, async () => {
    const template = await getTemplateByKey(form.key);
    const published = await getCurrentVersion(template!.id);
    const { draft } = await openDraft(template!.id, "qa-admin");
    expect(draft.status).toBe("draft");
    await saveDraft(draft.id, published!.document, published!.variants, "QA: a new version with no change");
    const next = await publishDraft(draft.id, "qa-admin");
    expect(next.version).toBe(published!.version + 1);
    expect((await getCurrentVersion(template!.id))?.id).toBe(next.id);
    const history = await listVersions(template!.id);
    expect(history.find((version) => version.id === published!.id)?.status).toBe("archived");
  });

  it(`${form.key} · 13 published versions remain immutable`, async () => {
    const { id } = await createViaChat(form);
    const pinned = store.form_instances.find((entry) => entry.id === id)!.template_version_id;
    const template = await getTemplateByKey(form.key);
    const published = await getCurrentVersion(template!.id);
    // A published version cannot be saved over.
    await expect(saveDraft(published!.id, published!.document, published!.variants, "overwrite")).rejects.toThrow();
    // A new version does not move a form already filed against the old one.
    const { draft } = await openDraft(template!.id, "qa-admin");
    await publishDraft(draft.id, "qa-admin");
    expect(store.form_instances.find((entry) => entry.id === id)!.template_version_id).toBe(pinned);
    expect(store.form_template_versions.find((entry) => entry.id === pinned)?.document).toEqual(published!.document);
  });

  it(`${form.key} · 14 no unintended Sun Tan City branding remains`, () => {
    const text = strings({ name: seed.name, shortName: seed.shortName, description: seed.description, document: seed.document, variants: seed.variants });
    for (const line of text) {
      const remaining = RETAINED_FOR_REVIEW.reduce((rest, retained) => rest.split(retained).join(""), line);
      expect(remaining, line).not.toMatch(/Sun\s*Tan\s*City|SUN TAN CITY|\bSTC\b|Ask\s*Sunny|ASK SUNNY/);
    }
    expect((seed.document as { style?: { logo?: unknown } }).style?.logo).toBeUndefined();
  });

  it(`${form.key} · 15 policy retrieval keeps Buff City Soap and company-wide policy only`, async () => {
    const document = parseFormDocument(seed.document);
    const keys = variantKeys.flatMap((variantKey) => fieldsForVariant(document, variantKey).map((field) => field.key));
    const citesManual = keys.some((key) => key === "policy_language" || key === "policy_references");
    if (!citesManual) {
      // This form retrieves no manual policy, here or on the reference platform:
      // it has no field the drafting fills from the manual.
      expect(draftableFields(document, variantKeys[0] ?? null).map((field) => field.key)).not.toContain("policy_language");
      return;
    }
    const read = readManualForBrand(
      jbaChunks.chunks.map((chunk) => ({ content: chunk.c, headings: chunk.h })),
      POLICY_MANUAL_BRAND_SCOPE,
    ).join("\n");
    for (const line of read.split("\n")) {
      if (!/Sun Tan City|\bSTC\b|Crunch/.test(line)) continue;
      expect(line).toMatch(/hired through Sun Tan|City, Crunch Fitness, and Buff City Soap|Group Fitness/);
    }
    // And the manual this form cites is read through the brand filter.
    const provider = readFileSync("src/lib/knowledge/providers/supabase.ts", "utf8");
    const fetchManual = provider.slice(provider.indexOf("async fetchOfficialPolicyManual"));
    expect(fetchManual.slice(0, fetchManual.indexOf("\n  async ", 10) > 0 ? fetchManual.indexOf("\n  async ", 10) : undefined)).toMatch(
      /readChunksForBrand/,
    );
  });

  it(`${form.key} · 16 role-based permissions apply`, async () => {
    expect(seed.requiredPermission).toBe(source.requiredPermission);
    const create = (role: string) => {
      actAs(role);
      return instancesRoute.POST(
        new Request("https://app.test/api/forms/instances", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateKey: form.key, employeeName: "Jordan Testperson", variantKey: seed.variants[0]?.key ?? null }),
        }),
      );
    };
    for (const role of ["employee", "assistant_manager", "location_manager", "district_manager", "admin"]) {
      const holds = hasPermission(DEFAULT_PERMISSION_MATRIX, role as never, seed.requiredPermission as never);
      const response = await create(role);
      expect(response.status, `${role} ${holds ? "may" : "may not"} create it`).toBe(holds ? 200 : 403);
    }
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, form.creator as never, seed.requiredPermission as never)).toBe(true);
  });

  it(`${form.key} · 17 existing Ask Bubbles functionality is unaffected`, async () => {
    expect(TEMPLATE_SEEDS.filter((entry) => entry.key === form.key)).toHaveLength(1);
    expect(COMPANY_FORM_CATEGORIES.map((category) => category.key)).toContain(seed.category);
    expect(FORM_LAYOUT_FAMILIES).toContain(seed.layoutFamily);
    expect(RETIRED_TEMPLATE_KEYS).not.toContain(form.key);
    // The library install is idempotent and touches nothing else.
    const before = JSON.stringify(store.form_templates);
    await ensureTemplateLibrary("system");
    expect(JSON.stringify(store.form_templates)).toBe(before);
  });
});

describe("the matrix covers the whole migrated library", () => {
  it("names all seventeen forms, once each", () => {
    expect(FORMS.map((form) => form.key).sort()).toEqual(MIGRATED_TEMPLATE_SEEDS.map((seed) => seed.key).sort());
    expect(FORMS).toHaveLength(17);
  });
});
