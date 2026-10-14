// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/brand-mark", () => ({ BuffCitySoapLogo: () => null }));

import type { ReviewsData } from "./load";
import { ReplyControls } from "./reply-controls";
import { ReviewsList } from "./reviews-data";
import type { ReplyView } from "@/lib/google-reviews/reply-view";
import { PAGE_SIZE, EMPTY_QUERY, type ReviewRow } from "@/lib/google-reviews/views";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const draft = (over: Partial<ReplyView> = {}): ReplyView => ({ id: "d1", kind: "new", status: "draft", body: "Thank you!", version: 3, lastErrorCode: null, stale: false, ...over });

function fetchMock(responses: { ok: boolean; json: unknown }[]) {
  const queue = [...responses];
  const fn = vi.fn(async () => {
    const next = queue.shift() ?? { ok: true, json: { status: "ok", reply: null } };
    return { ok: next.ok, json: async () => next.json } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const controls = (over: Partial<React.ComponentProps<typeof ReplyControls>> = {}) =>
  render(<ReplyControls reviewId="r-1" salon="Kearney, NE" existingReply={null} open={null} publishingEnabled {...over} />);

describe("saving a draft", () => {
  it("sends the text to the draft route only — never to the publish step — and says nothing was sent to Google", async () => {
    const fn = fetchMock([{ ok: true, json: { status: "ok", reply: { body: "Hi" } } }]);
    controls();
    fireEvent.click(screen.getByRole("button", { name: /Reply for Kearney/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Thanks for coming" } });
    expect((screen.getByRole("button", { name: /Publish to Google/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByText(/has not been sent to Google/)).toBeTruthy());
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/google-reviews/reviews/r-1/reply");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ body: "Thanks for coming" });
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks text over Google's 4,096-byte limit", () => {
    fetchMock([]);
    controls();
    fireEvent.click(screen.getByRole("button", { name: /Reply for/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "é".repeat(2100) } }); // 4,200 bytes
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("publishing needs an explicit confirmation", () => {
  it("shows the exact text and that it is public, and sends the confirmed version only from inside the dialog", async () => {
    const fn = fetchMock([{ ok: true, json: { status: "ok", reply: null } }]);
    controls({ open: draft({ body: "Exactly this text" }) });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    fireEvent.click(screen.getByRole("button", { name: /Publish to Google/ }));
    expect(fn).not.toHaveBeenCalled(); // opening the dialog sends nothing
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/posted publicly on Google/)).toBeTruthy();
    expect(within(dialog).getByText("Exactly this text")).toBeTruthy();
    expect(within(dialog).getByText(/Kearney, NE/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish reply" }));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ version: 3, confirmPublish: true });
  });

  it("cancel sends nothing", () => {
    const fn = fetchMock([]);
    controls({ open: draft() });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    fireEvent.click(screen.getByRole("button", { name: /Publish to Google/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(fn).not.toHaveBeenCalled();
  });

  it("replacing an existing owner reply needs its own tick, then sends confirmReplace", async () => {
    const fn = fetchMock([{ ok: true, json: { status: "ok", reply: null } }]);
    controls({ existingReply: "Old public reply", open: draft({ kind: "edit", body: "New public reply" }) });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    fireEvent.click(screen.getByRole("button", { name: /Publish to Google/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Old public reply")).toBeTruthy();
    const publish = within(dialog).getByRole("button", { name: "Publish reply" }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ version: 3, confirmPublish: true, confirmReplace: true });
  });

  it("a double click on Publish reply sends one request", async () => {
    const fn = fetchMock([{ ok: true, json: { status: "ok", reply: null } }]);
    controls({ open: draft() });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    fireEvent.click(screen.getByRole("button", { name: /Publish to Google/ }));
    const publish = within(screen.getByRole("dialog")).getByRole("button", { name: "Publish reply" });
    fireEvent.click(publish);
    fireEvent.click(publish);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cannot publish while switched off, with unsaved edits, or when the reply on Google changed", () => {
    fetchMock([]);
    const { unmount } = controls({ open: draft(), publishingEnabled: false });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    expect((screen.getByRole("button", { name: /Publish to Google/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not switched on yet/)).toBeTruthy();
    unmount();

    const second = controls({ open: draft() });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited but unsaved" } });
    expect((screen.getByRole("button", { name: /Publish to Google/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save your changes first/)).toBeTruthy();
    second.unmount();

    controls({ open: draft({ stale: true }) });
    expect(screen.getByText("Reply changed on Google")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    expect((screen.getByRole("button", { name: /Publish to Google/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("failures", () => {
  it("shows the server's sentence for a refusal and no Google detail", async () => {
    fetchMock([{ ok: false, json: { status: "failed", code: "reply_changed", reason: "The reply on Google changed since this draft was started. Nothing was sent." } }]);
    controls({ open: draft() });
    fireEvent.click(screen.getByRole("button", { name: /Open reply draft for/ }));
    fireEvent.click(screen.getByRole("button", { name: /Publish to Google/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish reply" }));
    await waitFor(() => expect(screen.getByText(/Nothing was sent/)).toBeTruthy());
  });

  it("a failed attempt shows its status and a plain-language reason", () => {
    controls({ open: draft({ status: "failed", lastErrorCode: "network_error" }) });
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText(/connection to Google dropped/)).toBeTruthy();
  });

  it("a network error in the browser is reported, not swallowed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    controls();
    fireEvent.click(screen.getByRole("button", { name: /Reply for/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByText(/could not be completed/)).toBeTruthy());
  });
});

describe("on the Reviews table", () => {
  const row = (over: Partial<ReviewRow>): ReviewRow => ({
    id: "id-66", storeCode: "66", storeName: "Kearney, NE", starRating: 5, comment: "Lovely", reviewerName: "Ann B.", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z",
    replyComment: null, replyUpdatedAt: null, hasReply: false, removedAt: null, ...over,
  });
  const data = (rows: ReviewRow[], replies: ReviewsData["replies"]): ReviewsData =>
    ({ query: EMPTY_QUERY, stores: [], trend: [], goals: null, rank: "month", page: { total: rows.length, page: 1, pageSize: PAGE_SIZE, rows }, replies }) as unknown as ReviewsData;

  it("draws Reply only on the salons the person may answer, never on removed reviews, and keeps the reviewer, rating, comment and existing reply", () => {
    const rows = [
      row({ id: "a", storeCode: "66", storeName: "Kearney, NE" }),
      row({ id: "b", storeCode: "219", storeName: "Lee's Summit, MO", reviewerName: null }),
      row({ id: "c", storeCode: "66", storeName: "Kearney, NE", removedAt: "2026-10-02T00:00:00Z" }),
      row({ id: "d", storeCode: "66", storeName: "Kearney, NE", replyComment: "Thanks for visiting!", hasReply: true, replyUpdatedAt: "2026-10-02T12:00:00Z" }),
    ];
    render(<ReviewsList data={data(rows, { access: { available: true, publishingEnabled: true, stores: ["66"] }, byReview: {} })} />);
    expect(screen.getAllByRole("button", { name: /Reply for Kearney|Edit reply for Kearney/ })).toHaveLength(2); // a and d
    expect(screen.queryByRole("button", { name: /Lee's Summit/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Edit reply for Kearney/ })).toBeTruthy();
    expect(screen.getByText("Anonymous reviewer")).toBeTruthy();
    expect(screen.getAllByText("Ann B.").length).toBeGreaterThan(0);
    expect(screen.getByText(/Thanks for visiting!/)).toBeTruthy();
  });

  it("draws no reply controls for someone who may not reply, or when the reply tables could not be read", () => {
    const rows = [row({})];
    const { unmount } = render(<ReviewsList data={data(rows, { access: { available: false, publishingEnabled: false, stores: [] }, byReview: {} })} />);
    expect(screen.queryByRole("button", { name: /Reply/ })).toBeNull();
    unmount();
    render(<ReviewsList data={data(rows, null)} />);
    expect(screen.queryByRole("button", { name: /Reply/ })).toBeNull();
    expect(screen.getByText("Lovely")).toBeTruthy();
  });
});
