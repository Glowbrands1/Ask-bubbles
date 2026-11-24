import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

import type { FormsActor } from "./access";

/**
 * HR APPROVAL, THE WHOLE ROUND TRIP (owner request, 23 Nov 2026), against the real `instances.ts` and `hr-approval.ts`:
 *
 *   the manager presses "Finalize and send to HR for approval"   → still a draft, pending; HR's bell rings
 *   the manager tries to change it                          → refused while HR has it
 *   HR edits it                                             → saved, in the approval history only
 *   HR sends it back without a note                         → refused: a note is required
 *   HR sends it back with a note                            → the manager's bell rings; they may edit and send again
 *   HR approves                                             → finalized, approved; the form's own history names the
 *                                                             manager, never HR
 *
 * Invented accounts and an invented employee.
 */

const ORIGINAL = { ...process.env };

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
} as FakeStore;
const extra = store as unknown as Record<string, Record<string, unknown>[]>;

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

const { ensureTemplateLibrary } = await import("./repository");
const { createInstance, loadInstance, saveInstanceValues, finalizeInstance, HeldForHrError } = await import("./instances");
const { sendForHrApproval, decideHrApproval, commentOnHrApproval, hrApprovalViewFor, finalizeGoesToHr, listHrQueue, listMyFormsWithHr, readHrApprovalsFor, recordHrEdit, hrQueueSummary, HrApprovalError } =
  await import("./hr-approval");

const CREATOR = "lm-thistle";
const HR = "hr-wren-oakfield";

const manager: FormsActor = { id: CREATOR, role: "location_manager", verified: true, scope: null, visibility: null, hrApprover: false };
const hr: FormsActor = { id: HR, role: "district_manager", verified: true, scope: null, visibility: null, hrApprover: true };
const theirDm: FormsActor = { id: "dm-bramble", role: "district_manager", verified: true, scope: null, visibility: null, hrApprover: false };

beforeEach(async () => {
  process.env.FORMS_HR_APPROVAL_ENABLED = "true";
  store.form_instances = [];
  store.form_instance_values = [];
  store.form_instance_events = [];
  store.form_template_versions = [];
  store.form_templates = [];
  store.form_template_current = [];
  store.form_template_assets = [];
  extra.form_hr_approvers = [{ app_user_id: HR, revoked_at: null }];
  extra.form_hr_approval_events = [];
  extra.app_notifications = [];
  extra.app_users = [
    { id: HR, email: "hr.wren@example.com", display_name: "Wren", status: "active" },
    { id: CREATOR, email: "thistle@example.com", display_name: "Thistle", status: "active" },
  ];
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

async function policyReview() {
  return createInstance({
    templateKey: "policy-review",
    variantKey: null,
    employeeName: "Juniper Calloway",
    employeeRole: "Team Member Part Time",
    locationId: "loc-store-a",
    locationName: "Invented Store",
    createdBy: CREATOR,
    source: "manual",
    formDate: "2026-11-23",
  });
}

const bells = (to: string) => extra.app_notifications!.filter((row) => row.recipient_email === to);

describe("which Finalize goes to HR", () => {
  it("a manager's Policy Review does; their Coaching Form does not; HR's own form does not; with no approver, or off, nothing does", async () => {
    const instance = await policyReview();
    expect(await finalizeGoesToHr(manager, instance)).toBe(true);
    const coaching = await createInstance({
      templateKey: "coaching", variantKey: null, employeeName: "Juniper Calloway", employeeRole: null,
      locationId: "loc-store-a", locationName: "Invented Store", createdBy: CREATOR, source: "manual", formDate: "2026-11-23",
    });
    expect(await finalizeGoesToHr(manager, coaching)).toBe(false);
    expect(await finalizeGoesToHr(hr, instance)).toBe(false);
    // No active approver: nobody could approve it, so Finalize finalizes as before (owner, 23 Nov 2026).
    extra.form_hr_approvers = [{ app_user_id: HR, revoked_at: "2026-11-23T00:00:00Z" }];
    expect(await finalizeGoesToHr(manager, instance)).toBe(false);
    extra.form_hr_approvers = [];
    expect(await finalizeGoesToHr(manager, instance)).toBe(false);
    extra.form_hr_approvers = [{ app_user_id: HR, revoked_at: null }];
    delete process.env.FORMS_HR_APPROVAL_ENABLED;
    expect(await finalizeGoesToHr(manager, instance)).toBe(false);
  });
});

describe("the round trip", () => {
  it("send, hold, HR edit, send back, resend, approve", async () => {
    const instance = await policyReview();

    // 1. Sent: still a draft, pending; HR's bell rings with the form, never another manager's.
    const sent = await sendForHrApproval(instance.id, manager, "2026-12-01", { acknowledgeUnverifiedPolicy: true });
    expect(sent.status).toBe("draft");
    expect(sent.hrApprovalState).toBe("pending");
    expect(bells("hr.wren@example.com")).toHaveLength(1);
    expect(bells("hr.wren@example.com")[0]).toMatchObject({ kind: "form_hr_approval_request", href: `/forms/hr-approval/${instance.id}` });
    await expect(sendForHrApproval(instance.id, manager, null)).rejects.toThrow(/already waiting/);

    // 2. The manager cannot change it, and plain Finalize cannot freeze it, while HR has it.
    await expect(saveInstanceValues(instance.id, { values: {}, checked: {} }, CREATOR)).rejects.toBeInstanceOf(HeldForHrError);
    await expect(finalizeInstance(instance.id, CREATOR, null)).rejects.toBeInstanceOf(HeldForHrError);

    // 3. HR's queue has it; a District Manager reads nothing about it.
    expect((await listHrQueue(hr)).map((row) => row.id)).toEqual([instance.id]);
    expect(await listHrQueue(theirDm)).toEqual([]);
    expect(await hrApprovalViewFor(theirDm, (await loadInstance(instance.id))!.instance)).toBeNull();

    // 4. HR edits it: saved through the one path past the hold, recorded in the approval history only.
    const eventsBefore = store.form_instance_events!.length;
    // As the PATCH route does it: the save, then the approval history's "edited".
    await saveInstanceValues(instance.id, { values: { form_date: "2026-11-22" }, checked: {} }, HR, { pastHrHold: true });
    await recordHrEdit(instance.id, hr);
    expect((await loadInstance(instance.id))!.instance.formDate).toBe("2026-11-22");
    expect(store.form_instance_events!.length, "HR's edit reached the form's general history").toBe(eventsBefore);

    // 5. Send back needs a note; with one, the manager's bell rings and they may change it again.
    await expect(decideHrApproval(instance.id, hr, "send_back", "  ")).rejects.toBeInstanceOf(HrApprovalError);
    await expect(decideHrApproval(instance.id, manager, "approve", null)).rejects.toThrow(/Only HR/);
    const back = await decideHrApproval(instance.id, hr, "send_back", "Please add the date she was told.");
    expect(back.hrApprovalState).toBe("changes_requested");
    // Changed on purpose (24 Nov 2026): the sender's first bell is now their own "You sent a form for HR approval"
    // receipt (owner request), so the decision is looked up by kind instead of being the first item.
    expect(bells("thistle@example.com").find((bell) => bell.kind === "form_hr_approval_decision")).toMatchObject({ title: "HR sent your form back for changes" });
    await saveInstanceValues(instance.id, { values: { form_date: "2026-11-21" }, checked: {} }, CREATOR);

    // 6. The manager's reply and HR's note: only the two of them read the history.
    await commentOnHrApproval(instance.id, manager, "Added it.");
    const view = await hrApprovalViewFor(manager, (await loadInstance(instance.id))!.instance);
    expect(view?.history.map((entry) => [entry.action, entry.by])).toEqual([
      ["submitted", "You"],
      ["edited", "HR"],
      ["changes_requested", "HR"],
      ["commented", "You"],
    ]);
    expect(view?.history.find((entry) => entry.action === "changes_requested")?.note).toBe("Please add the date she was told.");
    expect((await readHrApprovalsFor(CREATOR, true)).kind).toBe("manager");

    // 7. Sent again, then approved: finalized and approved in one write; the general history names the manager.
    await sendForHrApproval(instance.id, manager, "2026-12-01", { acknowledgeUnverifiedPolicy: true });
    const approved = await decideHrApproval(instance.id, hr, "approve", null);
    expect(approved.status).toBe("finalized");
    const row = store.form_instances!.find((entry) => entry.id === instance.id)!;
    expect(row).toMatchObject({ hr_approval_state: "approved", hr_approval_decided_by: HR, follow_up_date: "2026-12-01" });
    const finalized = store.form_instance_events!.filter((event) => event.instance_id === instance.id && event.kind === "finalized");
    expect(finalized.map((event) => event.actor)).toEqual([CREATOR]);
    expect(JSON.stringify(store.form_instance_events)).not.toContain(HR);
    expect(bells("thistle@example.com").map((bell) => bell.title)).toContain("HR approved your form");
    // HR's request bells for it are read once decided.
    expect(bells("hr.wren@example.com").filter((bell) => bell.kind === "form_hr_approval_request" && !bell.read_at)).toHaveLength(0);
  });

  it("reject needs a note too, and only a pending form can be decided", async () => {
    const instance = await policyReview();
    await expect(decideHrApproval(instance.id, hr, "approve", null)).rejects.toThrow(/not waiting/);
    await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    await expect(decideHrApproval(instance.id, hr, "reject", "")).rejects.toThrow(/why the form is rejected/);
    const rejected = await decideHrApproval(instance.id, hr, "reject", "This is not a policy review matter.");
    expect(rejected.hrApprovalState).toBe("rejected");
    expect(rejected.status).toBe("draft");
  });

  /*
   * ROLLBACK NEVER STRANDS A FORM (review of #1268): with the flag turned off, or the last approver revoked, nobody
   * can approve a pending form, so it goes back to its creator as an ordinary draft they can edit and finalize.
   */
  it.each([
    ["the flag is turned off", () => { delete process.env.FORMS_HR_APPROVAL_ENABLED; }],
    ["the only approver is revoked", () => { extra.form_hr_approvers = [{ app_user_id: HR, revoked_at: "2026-11-24T00:00:00Z" }]; }],
  ])("a pending form is released when %s: the creator edits and finalizes it", async (_case, rollBack) => {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    rollBack();
    const view = await hrApprovalViewFor(manager, (await loadInstance(instance.id))!.instance);
    expect(view?.released, "the card would stay locked").toBe(true);
    await saveInstanceValues(instance.id, { values: { form_date: "2026-11-24" }, checked: {} }, CREATOR);
    expect((await loadInstance(instance.id))!.instance.hrApprovalState).toBeNull();
    const finalized = await finalizeInstance(instance.id, CREATOR, null, { acknowledgeUnverifiedPolicy: true });
    expect(finalized.status).toBe("finalized");
  });

  it("a pending form's plain Finalize is refused while the hold is live", async () => {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    await expect(finalizeInstance(instance.id, CREATOR, null, { acknowledgeUnverifiedPolicy: true })).rejects.toBeInstanceOf(HeldForHrError);
  });

  /*
   * ANYONE WHO MAY EDIT THE DRAFT SENDS IT (owner, 23 Nov 2026: "Anyone who can open the draft can send it, and the
   * sender and the person who started it both see the status and Colene's note"). An Assistant's draft, sent by
   * their store manager.
   */
  it("an assistant manager's draft sent by their store manager: both see it and HR's answer, both get the bell, either resends", async () => {
    const assistant: FormsActor = { id: "am-marigold", role: "assistant_manager", verified: true, scope: null, visibility: null, hrApprover: false };
    extra.app_users!.push({ id: "am-marigold", email: "marigold@example.com", display_name: "Marigold", status: "active" });
    const instance = await createInstance({
      templateKey: "policy-review", variantKey: null, employeeName: "Juniper Calloway", employeeRole: null,
      locationId: "loc-store-a", locationName: "Invented Store", createdBy: "am-marigold", source: "manual", formDate: "2026-11-23",
    });
    const sent = await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    expect(sent.hrApprovalRequestedBy).toBe(CREATOR);
    expect(sent.createdBy).toBe("am-marigold");

    const { hiddenWhileAwaitingHr } = await import("./hr-approval-rules");
    expect(hiddenWhileAwaitingHr(assistant, sent)).toBe(false);
    expect(hiddenWhileAwaitingHr(manager, sent)).toBe(false);
    expect(hiddenWhileAwaitingHr(hr, sent)).toBe(false);
    expect(hiddenWhileAwaitingHr(theirDm, sent)).toBe(true);

    await decideHrApproval(instance.id, hr, "send_back", "Add the policy section number.");
    for (const email of ["marigold@example.com", "thistle@example.com"]) {
      expect(bells(email).map((bell) => bell.title), email).toContain("HR sent your form back for changes");
    }
    for (const reader of [assistant, manager]) {
      const view = await hrApprovalViewFor(reader, (await loadInstance(instance.id))!.instance);
      expect(view?.history.find((entry) => entry.action === "changes_requested")?.note).toBe("Add the policy section number.");
    }
    expect(await hrApprovalViewFor(theirDm, (await loadInstance(instance.id))!.instance)).toBeNull();
    expect((await readHrApprovalsFor("am-marigold", true)).kind).toBe("manager");

    // Either may resend. Everyone who has ever sent it keeps seeing it (owner, 23 Nov 2026: the store manager who
    // sent it still sees it after the assistant manager resends); the store's DM still sees nothing.
    const resent = await sendForHrApproval(instance.id, assistant, null, { acknowledgeUnverifiedPolicy: true });
    expect(resent.hrApprovalRequestedBy).toBe("am-marigold");
    expect(resent.hrApprovalSenders).toEqual([CREATOR, "am-marigold"]);
    expect(hiddenWhileAwaitingHr(assistant, resent)).toBe(false);
    expect(hiddenWhileAwaitingHr(manager, resent)).toBe(false);
    expect(hiddenWhileAwaitingHr(theirDm, resent)).toBe(true);
    // Both still read it among their own forms with HR, and both get HR's next decision.
    for (const reader of [assistant, manager]) {
      expect((await listMyFormsWithHr(reader)).map((row) => row.id), reader.id).toContain(instance.id);
    }
    expect(await listMyFormsWithHr(theirDm)).toEqual([]);
    await decideHrApproval(instance.id, hr, "approve", null);
    for (const email of ["marigold@example.com", "thistle@example.com"]) {
      expect(bells(email).map((bell) => bell.title), email).toContain("HR approved your form");
    }
  });
});

/*
 * THE NOTE REACHES HR'S BELL (owner, 23 Nov 2026, testing as HR in Ask Bubbles):
 *   "also make sure colene recieves the note, because i added a note when i finalized it and it didnt appear in colenes"
 *   "oh it shows here but also make it appear i nnotification"
 * The note was saved and shown on the review page, but the bell put it after the form line, on a line the bell cut
 * off. Now a note comes first in the bell, and the manager can write one beside the send button.
 */
// The invented Policy Review cites a policy the test knowledge base does not hold, so it is sent acknowledged.
const ACK = { acknowledgeUnverifiedPolicy: true } as const;

describe("the manager's note reaches HR's bell", () => {
  it("a note typed beside the send button is in HR's request bell, first, and in the approval history", async () => {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, ACK, "  test  ");

    const [request] = bells("hr.wren@example.com");
    expect(request?.title).toBe("A form is waiting for your approval");
    expect(String(request?.body)).toMatch(/^“test” — .*for Juniper Calloway at Invented Store/);
    expect(String(request?.body)).toContain("sent by Thistle.");
    // One bell for the send and its note, not a second "added a note" bell.
    expect(bells("hr.wren@example.com")).toHaveLength(1);

    const view = await hrApprovalViewFor(hr, (await loadInstance(instance.id))!.instance);
    expect(view?.history.map((entry) => [entry.action, entry.note])).toEqual([
      // The send records the policy acknowledgement this invented form needs (ACK); the manager's note is its own entry.
      ["submitted", "Sent with an unverified policy reference, acknowledged by the manager."],
      ["commented", "test"],
    ]);
  });

  it("no note: the request bell is as before", async () => {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, ACK, "   ");
    const [request] = bells("hr.wren@example.com");
    expect(String(request?.body)).toMatch(/for Juniper Calloway at Invented Store, sent by Thistle\.$/);
    expect(String(request?.body)).not.toMatch(/^“/);
    expect(extra.form_hr_approval_events!.filter((row) => row.action === "commented")).toHaveLength(0);
  });

  it("a note added after sending: the bell names who wrote it and starts with the note", async () => {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, ACK);
    await commentOnHrApproval(instance.id, manager, "test");
    const comment = bells("hr.wren@example.com").find((row) => row.kind === "form_hr_approval_comment");
    expect(comment?.title).toBe("Thistle added a note on a form you are approving");
    expect(String(comment?.body)).toMatch(/^“test” — .*for Juniper Calloway at Invented Store/);
  });

  it("HR's note on a send back starts the manager's bell too", async () => {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, ACK);
    await decideHrApproval(instance.id, hr, "send_back", "Add the date of the prior coaching.");
    const decision = bells("thistle@example.com").find((row) => row.kind === "form_hr_approval_decision");
    expect(String(decision?.body)).toMatch(/^“Add the date of the prior coaching\.” — .*for Juniper Calloway/);
  });
});

/*
 * ============================================================================
 * "MANAGER REPLIED TO CHANGES" (owner, 23 Nov 2026)
 * ============================================================================
 *
 * "colene sent to marissa, marissa replied and it shows … 'sent back for changes' still. it should be Manager Replied
 * to changes. then view then approve." And the tab read "Pending HR approval (0)" while the row was listed.
 */
describe("manager replied to changes", () => {
  async function sentBack() {
    const instance = await policyReview();
    await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    await decideHrApproval(instance.id, hr, "send_back", "Please add the time she arrived.");
    return instance;
  }

  it("sent back: not HR's turn; the count leaves it out and HR may not approve yet", async () => {
    const instance = await sentBack();
    const [row] = await listHrQueue(hr);
    expect(row).toMatchObject({ id: instance.id, managerReplied: false });
    expect(await hrQueueSummary(hr)).toEqual({ pending: 0, overdue: 0 });
    const view = await hrApprovalViewFor(hr, (await loadInstance(instance.id))!.instance);
    expect(view).toMatchObject({ stage: "changes_requested", label: "Sent back by HR for changes", canApproveSentBack: false });
    await expect(decideHrApproval(instance.id, hr, "approve", null)).rejects.toThrow(/sent back for changes. It can be approved or sent back again once the manager replies/);
  });

  it("the manager's reply: HR's row reads \"Manager replied to changes\" and counts in Pending HR approval", async () => {
    const instance = await sentBack();
    await commentOnHrApproval(instance.id, manager, "She arrived at 9:20.");
    const rows = await listHrQueue(hr);
    expect(rows.map((row) => [row.id, row.managerReplied])).toEqual([[instance.id, true]]);
    // The count always equals the rows that need HR's decision.
    const { needsHrDecision } = await import("./hr-approval-rules");
    expect((await hrQueueSummary(hr))!.pending).toBe(rows.filter(needsHrDecision).length);
    expect((await hrQueueSummary(hr))!.pending).toBe(1);
    const hrView = await hrApprovalViewFor(hr, (await loadInstance(instance.id))!.instance);
    expect(hrView).toMatchObject({ state: "changes_requested", stage: "manager_replied", label: "Manager replied to changes", canApproveSentBack: true, canDecide: false });
    // The manager's own list says the same.
    expect((await listMyFormsWithHr(manager)).map((row) => row.label)).toEqual(["Manager replied to changes"]);
  });

  it("HR's own note after sending it back is not the manager's reply", async () => {
    const instance = await sentBack();
    await commentOnHrApproval(instance.id, hr, "Also the date.");
    expect((await listHrQueue(hr))[0]).toMatchObject({ id: instance.id, managerReplied: false });
  });

  it("a reply to an EARLIER send-back does not count once HR sends it back again", async () => {
    const instance = await sentBack();
    await commentOnHrApproval(instance.id, manager, "Added it.");
    await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    await decideHrApproval(instance.id, hr, "send_back", "Still missing the time.");
    expect((await listHrQueue(hr))[0]).toMatchObject({ managerReplied: false });
  });

  it("HR approves the replied form: finalized and approved; the manager's bell says so; the form is no longer in HR's list", async () => {
    const instance = await sentBack();
    await commentOnHrApproval(instance.id, manager, "She arrived at 9:20.");
    // Reject stays for a pending form.
    await expect(decideHrApproval(instance.id, hr, "reject", "No.")).rejects.toThrow(/not waiting/);
    await expect(decideHrApproval(instance.id, manager, "approve", null)).rejects.toThrow(/Only HR/);
    const approved = await decideHrApproval(instance.id, hr, "approve", null);
    expect(approved.status).toBe("finalized");
    expect(store.form_instances!.find((entry) => entry.id === instance.id)).toMatchObject({ hr_approval_state: "approved", hr_approval_decided_by: HR });
    expect(bells("thistle@example.com").map((bell) => bell.title)).toContain("HR approved your form");
    expect(await listHrQueue(hr)).toEqual([]);
    const history = (await hrApprovalViewFor(manager, (await loadInstance(instance.id))!.instance))!.history;
    expect(history.at(-1)).toMatchObject({ action: "approved", by: "HR" });
    // Approved, it is an ordinary finalized form (the register scopes it by store: hr-approval-visibility.test.ts); the
    // approval and HR's notes stay with the creator, the sender and HR: the store's District Manager reads none of it.
    const finalForm = (await loadInstance(instance.id))!.instance;
    expect(await hrApprovalViewFor(theirDm, finalForm)).toBeNull();
    expect(await hrApprovalViewFor(hr, finalForm)).not.toBeNull();
    const dmRead = await readHrApprovalsFor(theirDm.id, true);
    expect(dmRead.kind === "manager" ? dmRead.forms : []).toEqual([]);
    // "Was my CA approved?": the AI's reader gives it as approved, to its creator only.
    const read = await readHrApprovalsFor(CREATOR, true);
    expect(read.kind === "manager" ? read.forms.map((row) => [row.id, row.label]) : []).toEqual([[instance.id, "Approved by HR"]]);
  });

  it("HR sends the replied form back again (QA, 23 Nov 2026): a note is required; it is the manager's turn again", async () => {
    const instance = await sentBack();
    await commentOnHrApproval(instance.id, manager, "She arrived at 9:20.");
    await expect(decideHrApproval(instance.id, hr, "send_back", " ")).rejects.toThrow(/what needs to change/);
    const again = await decideHrApproval(instance.id, hr, "send_back", "Also the date.");
    expect(again.hrApprovalState).toBe("changes_requested");
    expect((await listHrQueue(hr))[0]).toMatchObject({ id: instance.id, managerReplied: false });
    expect((await hrQueueSummary(hr))!.pending).toBe(0);
    expect(bells("thistle@example.com").filter((bell) => bell.title === "HR sent your form back for changes")).toHaveLength(2);
    // Before the manager replies again, HR may not approve it.
    await expect(decideHrApproval(instance.id, hr, "approve", null)).rejects.toThrow(/sent back for changes/);
  });
});
