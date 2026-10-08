/**
 * Ask Bubbles — domain types.
 *
 * These describe the product's real domain, not the prototype's shortcuts.
 * Mock providers and seeded demo data both conform to these shapes, so
 * swapping a mock for a live service (Claude, Supabase, SharePoint, Power BI,
 * Google Business Profile) is an implementation change, not a type change.
 */

import type { SavedFeedback } from "@/lib/feedback/types";

/* ---------------------------------------------------------------- People --- */

/**
 * WHO SOMEBODY IS IN ASK BUBBLES — the PLATFORM role keys.
 *
 * These keys are deliberately company-neutral. What each one is CALLED at
 * Buff City Soap (its label, short label and description) and what it may DO
 * (its permissions) are company configuration and live in
 * `src/config/company/access.ts`, so a change to Buff's titles is a config
 * edit rather than a migration.
 *
 * `employee` is the frontline role and is listed FIRST because it is the
 * least privileged and the default for a new invitation: reading this list
 * top to bottom is reading it in order of access.
 *
 * `admin` is the CLIENT administrator, and is deliberately not `developer`:
 * one is the customer's own administrator, the other is internal build and
 * support.
 *
 * Mirrored by `public.app_user_role` in the database, and asserted against it.
 */
export type Role =
  | "employee"
  | "assistant_manager"
  | "location_manager"
  | "district_manager"
  | "regional_manager"
  | "admin"
  | "owner"
  | "developer";

/**
 * Breadth of an assignment. `location` is one store (a Makery, at Buff City
 * Soap — the user-facing noun is `COMPANY.brand.vocabulary.locationNoun`).
 * Mirrored by `public.app_scope_level`.
 */
export type ScopeLevel = "global" | "region" | "district" | "location";

export interface AccessScope {
  /** Breadth of the assignment. */
  level: ScopeLevel;
  /** Primary area id — a location id, district id, or region id. */
  primaryAreaId: string | null;
  /**
   * "Also covers" — RMs and DMs frequently cover extra districts or regions
   * on top of their primary assignment.
   */
  alsoCoversAreaIds: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  scope: AccessScope;
  /** Location-level shared accounts sign in under the location's email. */
  isLocationAccount: boolean;
  active: boolean;
  avatarInitials: string;
  title: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface Location {
  id: string;
  name: string;
  city: string;
  state: string;
  districtId: string;
  districtName: string;
  regionId: string;
  regionName: string;
}

/* ----------------------------------------------------------- Permissions --- */

export type Permission =
  /** Ask the assistant questions. */
  | "ask_questions"
  /** Open the Home dashboard. */
  | "view_overview"
  /**
   * READ the knowledge base. Separate from `manage_knowledge`, which uploads,
   * deletes and reindexes: a frontline employee needs the first and must
   * never have the second.
   */
  | "view_knowledge"
  | "manage_knowledge"
  /**
   * REACH THE FORMS WORKSPACE AT ALL. Which forms somebody may CREATE is still
   * decided per template by its `requiredPermission`.
   */
  | "view_forms_workspace"
  /**
   * CREATE FORMS FROM THE COMPANY FORMS REGISTRY. The generic creation grant.
   * A template that needs a narrower audience names a narrower permission in
   * `src/config/company/forms/` — add the key here and grant it in
   * `src/config/company/access.ts`.
   */
  | "create_forms"
  /**
   * PER-FORM CREATION, carried over from the reference platform's forms
   * library. Each migrated template names one of these as its
   * `requiredPermission`; `create_forms` remains the generic grant for the
   * registry's other forms.
   */
  | "create_coaching_form"
  | "create_corrective_action"
  | "create_policy_review"
  | "create_epp"
  | "create_hiring_form"
  | "create_exit_form"
  | "create_employment_change_form"
  | "view_form_monitoring"
  | "manage_form_templates"
  /**
   * REMOVING A FILED FORM IS ITS OWN PERMISSION. Deleting a draft destroys
   * somebody's work and archiving hides a record, so it sits with the roles
   * that administer Forms rather than with everyone who can see the table.
   */
  | "manage_form_records"
  | "view_reports"
  | "view_ai_usage"
  /**
   * VIEW ADOPTION ANALYTICS. Its own permission rather than a reuse of
   * `view_ai_usage`: AI Usage is a vendor bill; Analytics names individual
   * people and how much they use the product.
   */
  | "view_analytics"
  | "manage_users"
  | "manage_integrations";

export type PermissionMatrix = Record<Role, Permission[]>;

/* ------------------------------------------------------------- Knowledge --- */

export type KnowledgeCategory =
  | "policies_compliance"
  | "operations"
  | "training"
  | "leadership_coaching"
  | "sales_client_experience"
  | "reports_analytics"
  | "bonuses_compensation"
  | "safety"
  | "equipment_procedures"
  | "other";

export type DocumentStatus = "ready" | "processing" | "needs_review" | "failed" | "superseded";

/**
 * Where a document came from. Only `upload` is live in this phase — the other
 * three are the seams for SharePoint sync, Woven export, and system-seeded
 * demo content respectively.
 */
export type DocumentSource = "upload" | "sharepoint" | "woven" | "system";

export type DocumentFileType =
  | "pdf"
  | "docx"
  | "xlsx"
  | "txt"
  | "md"
  | "pptx"
  | "image"
  | "other";

export interface DocumentVersion {
  version: number;
  uploadedAt: string;
  uploadedBy: string;
  sizeBytes: number;
  note?: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  description: string;
  category: KnowledgeCategory;
  fileName: string;
  fileType: DocumentFileType;
  sizeBytes: number;
  /** Approximate extracted character count, shown in the library listing. */
  characterCount: number;
  status: DocumentStatus;
  source: DocumentSource;
  version: number;
  previousVersions: DocumentVersion[];
  uploadedBy: string;
  uploadedAt: string;
  updatedAt: string;
  /** True once the ingestion pipeline has chunked + embedded it. */
  indexed: boolean;
  /**
   * Why the last processing run failed, in words a manager can act on.
   * Present only when status is "failed". Never contains document text.
   */
  failureReason?: string;
  tags: string[];
  /** Present only for prototype uploads persisted to IndexedDB. */
  blobKey?: string;
}

/**
 * A retrieval unit. Not produced in this phase — the future ingestion pipeline
 * (extract -> chunk -> embed -> store) emits these and the retriever returns
 * them. Defined now so citation plumbing does not have to be rewritten.
 */
export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  /** Page or section label surfaced in the citation, e.g. "Page 14". */
  locator: string;
  embedding?: number[];
}

export interface SourceCitation {
  documentId: string;
  documentTitle: string;
  /** e.g. "Page 14" or "Coaching Standards". */
  locator: string;
  category: KnowledgeCategory;
  excerpt: string;
  /** 0–1. In this phase a mock keyword score. */
  relevance: number;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  locator: string;
  content: string;
  score: number;
}

/* ------------------------------------------------------------------ Chat --- */

export type AnswerMode = "quick" | "standard" | "detailed";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /**
   * THE SERVER'S NAME FOR THE TURN THIS ASSISTANT MESSAGE ANSWERED.
   *
   * `id` above is the browser's — minted by `createId("msg")` and meaningful
   * only inside this browser's own IndexedDB. This one is the `activity_events`
   * row the server recorded the turn as, and the difference is what makes
   * feedback possible at all: a rating keyed to a browser-chosen id is a rating
   * anybody could claim to have left about anything.
   *
   * Assistant messages only, and absent on a turn whose activity insert did not
   * land (analytics is best-effort and must never fail an answer). No `turnId`
   * means no feedback panel — the honest outcome when there is nothing to
   * attach a rating to.
   */
  turnId?: string;
  /**
   * What THIS person said about this answer, once they have said it.
   *
   * Stored on the message so it survives a refresh, so a reopened thread shows
   * the words somebody already wrote instead of an empty form, and so the
   * "answer the last one before asking the next" rule can be evaluated against
   * the thread rather than against a component's own memory — which would
   * forget the moment the surface unmounted, and it unmounts every time a
   * manager changes a report filter.
   */
  feedback?: SavedFeedback;
  mode?: AnswerMode;
  citations?: SourceCitation[];
  /**
   * LEGACY, READ-ONLY. Never set on a new message.
   *
   * Conversations live in browser IndexedDB, so a manager can still open a
   * thread from before Phase 2 that carries one of these. The field stays on
   * the type so those stored messages deserialize and render as ordinary prose
   * instead of throwing — and `MessageBubble` no longer renders its
   * "Open in Create a Form" redirect for it. See `docs/chat-phase-2.md`.
   */
  formHandoff?: FormHandoff;
  /** Chips the user can click to continue a scripted flow. */
  followUpSuggestions?: string[];
  /**
   * Whether the knowledge base actually covered the question. Rendered as a
   * distinct state so "I do not have that" reads as an honest answer rather
   * than a failure — and so it is never mistaken for a grounded one.
   */
  coverage?: "grounded" | "insufficient" | "not_applicable";
  /**
   * What Bubbles is offering to create. Rendered inline; creates nothing.
   *
   * This replaces `pendingFormTemplateId` / `pendingFormValues`, which
   * accumulated half-filled HR values in browser-local chat state and let a
   * missing fact become a demo fact on the next turn.
   */
  formProposal?: ChatFormProposal;
  /**
   * The form choices offered when the request named no form.
   *
   * Present INSTEAD of a proposal: an ambiguous request produces a question,
   * and a question has no template, no employee and no location to propose.
   */
  formSelection?: ChatFormSelection;
  /**
   * The REAL form this turn created, once the manager confirmed the proposal.
   *
   * A POINTER, NOT A COPY — see `ChatFormInstanceRef`.
   */
  formInstanceRef?: ChatFormInstanceRef;
  /**
   * Set instead of `content` when the turn failed. The chat surface renders
   * this as a distinct, actionable state rather than as an answer — a failure
   * must never be mistaken for something Bubbles said.
   */
  error?: ChatTurnError;
}

/**
 * ============================================================================
 * A POINTER TO A REAL FORM — NEVER A COPY OF ONE
 * ============================================================================
 *
 * ONCE THE INSTANCE EXISTS, POSTGRES IS THE SOURCE OF TRUTH. Chat lives in the
 * browser's IndexedDB; a form is an HR record that outlives the browser it was
 * created in, gets edited from Form Monitoring, gets finalized, and gets read by
 * people who were never in this conversation.
 *
 * So this carries an ID and nothing that can go stale against the server. No
 * field values, no checked options, no status, no follow-up date, no finalized
 * flag, no PDF path. Every render fetches the instance by id; a value shown in
 * chat is a value the server just returned.
 *
 * `templateName` is the single exception, and it is PRESENTATION ONLY — a label
 * so the collapsed card can say which form it points at before the fetch
 * resolves. Nothing decides anything from it.
 */
export interface ChatFormInstanceRef {
  /** The `form_instances` row. The only durable authority stored in chat. */
  instanceId: string;
  /** Which proposal became this form, for the audit trail a manager can read. */
  proposalId: string;
  /** Presentation only. The server's own name is used once the fetch lands. */
  templateName: string;
}

/** Why a chat turn failed, and what the manager can do about it. */
export interface ChatTurnError {
  kind:
    | "not_configured"
    | "unauthenticated"
    | "retrieval_failed"
    | "model_failed"
    | "rate_limited"
    | "bad_request"
    | "turn_unavailable"
    | "unknown";
  message: string;
  /** Environment variable NAMES that are unset. Never values. */
  missing?: string[];
  /** True when re-sending the same question is worth trying. */
  retryable: boolean;
  /** The question that failed, so the UI can offer to send it again. */
  question: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Files attached to a conversation stay in context for its lifetime. */
  attachedDocumentIds: string[];
}

/**
 * ============================================================================
 * A FORM PROPOSAL — WHAT BUBBLES IS OFFERING TO CREATE, AND WHAT IS STILL MISSING
 * ============================================================================
 *
 * THE PROPOSAL IS NOT THE HR RECORD. Nothing here is a form: there is no
 * template version, no instance id, no field values, no follow-up date, no
 * status and no signature. Those belong to `form_instances`, which is the one
 * source of truth, and none of them exist until a manager confirms.
 *
 * SO WHAT IS IT FOR? Showing the manager, before anything is written, exactly
 * which form Bubbles matched, who it thinks the form is about, and which location it
 * would be filed against — with anything it could not establish named as
 * missing rather than filled in with something plausible.
 *
 * `sourceMessageIds` IS THE DURABLE PART. It points at the manager's own turns
 * rather than copying them, so when a form is eventually drafted the authority
 * is what the manager actually said — not a summary of it, and never Bubbles'
 * paraphrase of it.
 */
/**
 * ============================================================================
 * ONE FORM CHOICE, AS THE PICKER NEEDS IT
 * ============================================================================
 *
 * A projection of a published template row — key, name, description — and
 * nothing else. It carries no field configuration, no version, no permission
 * and no instance: choosing one sends a sentence back through the same
 * proposal flow a typed request goes through, where the key is resolved
 * against `form_templates` and the template's own `required_permission` is
 * applied again. Nothing here is authority.
 */
export interface ChatFormChoice {
  /** Resolved server-side against the published library on the next turn. */
  templateKey: string;
  templateName: string;
  /** The library's own description. Never written in a component. */
  description: string;
}

/**
 * ============================================================================
 * WHICH FORM? — ASKED WITHOUT EMPTYING THE LIBRARY INTO THE CONVERSATION
 * ============================================================================
 *
 * The honest answer to "create a form" is a question, and it was answered by
 * listing every form the manager may create — thirteen of them, in prose, in a
 * chat bubble. Correct and unreadable.
 *
 * So the choices travel as data: the everyday form offered on its own, the rest
 * collapsed behind a control. `primary` IS NOT A SELECTION. Nothing is created,
 * nothing is pinned, and no template is decided until the manager clicks — the
 * NO DEFAULT TEMPLATE rule is intact, and this is a suggestion of where most
 * people start, made visible rather than made for them.
 *
 * Built only from templates that survived the published-and-permitted filter,
 * so a form this person cannot create is never offered — not even collapsed.
 */
export interface ChatFormSelection {
  /** Shown immediately. Suggested, never selected. */
  primary: ChatFormChoice;
  /** Revealed by "See more forms", in the library's display order. */
  additional: ChatFormChoice[];
}

export interface ChatFormProposal {
  /** Identifies this proposal within the conversation. Not a form instance id. */
  proposalId: string;
  /** Validated against the published, active template library, server-side. */
  templateKey: string;
  templateName: string;
  /**
   * Whether this proposal can become a real form WITHOUT LEAVING CHAT.
   *
   * SERVER-DECIDED, and carried rather than inferred, so no chat component has
   * to know which templates inline creation supports. Phase 3 ships the Coaching
   * Form only; every other published template still proposes, and its card
   * offers no create action rather than a control that does nothing.
   *
   * It is a presentation hint and nothing more. `POST /api/forms/instances`
   * re-checks the template, its published version, the actor's permission and
   * the location on every call, so a browser that flips this to `true` gains
   * exactly nothing.
   */
  supportsInlineDraft: boolean;
  /**
   * The reading of the document this proposal would pin, for a template that
   * prints as more than one.
   *
   * `null` for the twelve templates that declare no variants, and for those
   * the column has always held null. Set only where the published version
   * declares EXACTLY ONE reading — for example a review form whose only
   * reading is one role reviewed by one manager — because a document with several
   * cannot be created from chat at all until something asks which. See
   * `lib/forms/inline-draft.ts`.
   *
   * A presentation hint like `supportsInlineDraft`: the create route
   * revalidates it against the pinned version.
   */
  variantKey: string | null;
  /** Null until the manager names one. Never inferred from an assistant turn. */
  employeeName: string | null;
  /**
   * The employee's job title, where the MANAGER stated it.
   *
   * "Riley is a Shift Lead at River Market" says it; nothing else does. It is
   * null whenever they did not, and it is never inferred from the template —
   * a review form is frequently written for somebody whose title the manager
   * spells differently, and printing a guessed title on an employment record
   * is the class of default this whole path exists to refuse.
   */
  employeeRole: string | null;
  /**
   * The form's date (`YYYY-MM-DD`), where the MANAGER typed one — "9/11",
   * "Sep 11", "September 11, 2026". A month and day take the current year.
   *
   * Null when they gave none, or only "today", and the form keeps its default
   * of today. Optional because proposals already stored in a browser predate
   * it. The create route revalidates it, and the Date field stays editable.
   */
  formDate?: string | null;
  /**
   * The Corrective Action Form's "Is payroll deduct applicable?", where the
   * MANAGER answered it in the conversation. Null (or absent) when they have
   * not — it is never defaulted. Sent at creation, revalidated by the create
   * route against the pinned version, and written as the manager's statement.
   * See `lib/forms/payroll-deduct.ts`.
   */
  payrollDeduct?: "yes" | "no" | null;
  /** Null unless the authenticated scope proves exactly one location. */
  locationId: string | null;
  /**
   * Display name for the resolved location, when one is available.
   *
   * Absent today: there is no location roster to resolve a name from an id, and
   * inventing one would put a fictional location in front of a manager about to
   * file a disciplinary record. See `docs/chat-phase-2.md`.
   */
  locationName: string | null;
  locationResolution: "resolved" | "needs_selection" | "not_applicable" | "unavailable";
  /**
   * Location ids this actor is assigned to, when there is more than one.
   *
   * Their OWN assignment, echoed back so the card can offer a choice rather
   * than a dead end. Ids, not names: there is no location roster, and the only
   * source of a display name in this app is seeded demo data. Whatever comes
   * back is re-authorized against the scope by `POST /api/forms/instances`, so
   * an edited list buys nothing.
   */
  authorizedLocationIds: string[];
  /**
   * A location the manager NAMED that their scope does not cover, by its roster
   * name — set only when nothing they named is theirs. It is never filed
   * against; it is why the card asks which of their own locations this is.
   * Optional so conversations stored before it existed still read.
   */
  namedLocationOutOfScope?: string | null;
  /**
   * What is still needed. `ready` means nothing is — NOT that anything exists.
   *
   * There is no "needs_template" state, because a proposal without a validated
   * template is not a proposal: when Bubbles cannot tell which form was asked
   * for, or the library does not publish it, the turn carries a question and no
   * proposal at all rather than a card with an empty frame.
   */
  status: "needs_employee" | "needs_location" | "ready";
  /**
   * The MANAGER turns this proposal was built from, oldest first. Ids, not
   * text: the conversation keeps the words, and this keeps the pointer.
   */
  sourceMessageIds: string[];
  /**
   * "team" for a team-wide Coaching Form, whose `employeeName` is the fixed
   * subject label rather than a person. Absent means one employee — every
   * proposal stored before this existed. See `lib/forms/team-subject.ts`.
   */
  subject?: "team";
}

export interface FormHandoff {
  templateId: string;
  templateName: string;
  values: Record<string, string>;
  checkedOptions: Record<string, string[]>;
}

/* ----------------------------------------------------------------- Forms --- */

export type TemplateFieldType =
  | "text"
  | "long_text"
  | "date"
  | "select"
  | "checkbox_group"
  | "signature";

/** Who is responsible for putting content in a field. */
export type FieldFillRule =
  | "ai_populate"
  | "manager_completes"
  | "signature_never_ai";

export interface TemplateField {
  id: string;
  label: string;
  type: TemplateFieldType;
  fillRule: FieldFillRule;
  required: boolean;
  helpText?: string;
  options?: string[];
  /** Section header this field renders under in the printed form. */
  section: string;
}

export interface UploadedPdfTemplate {
  id: string;
  templateId: string;
  fileName: string;
  isBundledDefault: boolean;
  replacedBy?: string;
  replacedAt?: string;
  sizeBytes: number;
}

export interface FormTemplate {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** Permission required to create this form. */
  permission: Permission;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  fields: TemplateField[];
  acknowledgement: string;
  /** True when a saved document template overrides the uploaded PDF. */
  hasDocumentTemplate: boolean;
  pdf: UploadedPdfTemplate;
}

export type GeneratedFormStatus =
  | "draft"
  | "open"
  | "due_soon"
  | "overdue"
  | "followed_up"
  | "completed";

export interface GeneratedForm {
  id: string;
  templateId: string;
  templateName: string;
  employeeName: string;
  employeeRole: string;
  locationId: string;
  locationName: string;
  createdBy: string;
  createdAt: string;
  formDate: string;
  followUpDate: string | null;
  status: GeneratedFormStatus;
  values: Record<string, string>;
  checkedOptions: Record<string, string[]>;
  archived: boolean;
}

export interface FormFollowUp {
  formId: string;
  employeeName: string;
  templateName: string;
  dueDate: string;
  daysUntilDue: number;
  status: GeneratedFormStatus;
}

/* --------------------------------------------------------------- Reviews --- */

export interface ReviewMetric {
  locationId: string;
  locationName: string;
  districtName: string;
  totalReviews: number;
  reviewsGainedThisWeek: number;
  reviewsGainedLastWeek: number;
  averageRating: number;
  weeklyGoal: number;
}

export interface CustomerReview {
  id: string;
  locationId: string;
  locationName: string;
  authorName: string;
  rating: number;
  text: string;
  postedAt: string;
  responded: boolean;
}

/* ------------------------------------------------------------- Reporting --- */

export type MetricTrend = "up" | "down" | "flat";

export interface DashboardMetric {
  id: string;
  label: string;
  value: string;
  helper?: string;
  changeLabel?: string;
  trend?: MetricTrend;
}

export interface TimeSeriesPoint {
  label: string;
  [series: string]: string | number;
}

/* ------------------------------------------------- Resources & platform --- */

export type ResourceCategory =
  | "meetings"
  | "reporting"
  | "documents"
  | "training"
  | "people"
  | "support"
  | "other";

export interface ExternalResource {
  id: string;
  name: string;
  description: string;
  category: ResourceCategory;
  url: string;
  /** External apps open in a new tab; internal ones route inside Ask Bubbles. */
  openMode: "new_tab" | "internal" | "modal";
  owner: string;
  /** Honest status — nothing is wired up in this phase. */
  availability: "available" | "coming_soon";
  iconKey: string;
}

export type IntegrationStatus = "connected" | "not_connected" | "planned";

export interface Integration {
  id: string;
  name: string;
  vendor: string;
  description: string;
  status: IntegrationStatus;
  /** What it unlocks once connected. */
  unlocks: string;
  category: "ai" | "documents" | "reporting" | "reviews" | "communication" | "storage";
  iconKey: string;
  notes?: string;
}

export interface AIUsageRecord {
  id: string;
  at: string;
  feature: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  status: "succeeded" | "failed";
}

/* ----------------------------------------------------------------- Brand --- */

export interface BrandConfig {
  /** Machine id — also the knowledge scope id. */
  id: string;
  /** e.g. "Buff City Soap". */
  brandName: string;
  /** e.g. "Ask Bubbles". */
  productName: string;
  /** e.g. "Bubbles". */
  assistantName: string;
  /** The legal/operating entity named in footers and metadata. */
  operatorName: string;
  wordmark: {
    lead: string;
    trail: string;
  };
  tagline: string;
  /** One sentence for page metadata. */
  description: string;
  /**
   * Maps the semantic aliases in globals.css to this brand's raw values.
   * Applied at the app shell, so a second brand is a config swap.
   */
  paletteTokens: Record<string, string>;
  /**
   * The parent brand's official logo artwork, served from `public/`. One file
   * per approved colour, so the logo is never recoloured in CSS. All three are
   * the same artwork at the same intrinsic size.
   */
  logo: {
    /** Approved logo colours only — see the brand guidelines' logo rules. */
    stacked: Record<"tokyoGreen" | "white" | "charcoal", string>;
    width: number;
    height: number;
  };
  /** Scopes knowledge retrieval to one brand's corpus. */
  knowledgeScopeId: string;
  vocabulary: {
    /** What one store is called in copy: "location" (Buff may prefer "Makery"). */
    locationNoun: string;
    locationNounPlural: string;
  };
}
