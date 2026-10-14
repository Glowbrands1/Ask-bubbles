import "server-only";

import { GoogleApiError, classifyGoogleError } from "./client";

/**
 * THE ONLY CODE THAT WRITES TO GOOGLE: one review's owner reply.
 *
 *   getReview(name)         GET /v4/{accounts/a/locations/l/reviews/r}         what Google holds now
 *   putReply(name, comment) PUT /v4/{accounts/a/locations/l/reviews/r}/reply   create or replace the reply
 *
 * Google's Reviews API (My Business v4, `reviews.updateReply`) creates the owner reply or REPLACES
 * the existing one — it is idempotent for the same text. There is no delete here: the product does
 * not remove replies.
 *
 * `client.ts` (what the sync uses) is still GET-only and does not import this file.
 *
 * SAFETY
 *   - A review name must be exactly `accounts/{n}/locations/{n}/reviews/{id}`; anything else is refused
 *     before a request is made, so a caller cannot aim the request at another path.
 *   - The write is NEVER retried by this class. A 401 is retried once after a forced token refresh
 *     (Google rejected the token before doing anything). A 5xx, a timeout or a dropped connection
 *     is reported as `network_error` / `server_error` and the CALLER treats the outcome as unknown: its
 *     next attempt compares with `getReview` before sending anything again.
 *   - Google's response bodies are never kept: only the reply's comment and updateTime are read.
 *   - `redirect: "error"`, a 20 s timeout, no cookies, the bearer token only in the header.
 */

const MY_BUSINESS_V4 = "https://mybusiness.googleapis.com";
const REQUEST_TIMEOUT_MS = 20_000;
const REVIEW_NAME = /^accounts\/[0-9]{1,30}\/locations\/[0-9]{1,30}\/reviews\/[A-Za-z0-9_.:=+-]{1,200}$/;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GoogleReplyClientOptions {
  getAccessToken: () => Promise<string>;
  forceRefresh?: () => void;
  fetchImpl?: FetchLike;
}

export interface GoogleReplyState {
  /** The owner reply Google holds now, or null if the review has none. */
  comment: string | null;
  updateTime: string | null;
}

export class GoogleReplyClient {
  private readonly fetchImpl: FetchLike;
  constructor(private readonly options: GoogleReplyClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async call(method: "GET" | "PUT", url: string, payload?: unknown): Promise<unknown> {
    let refreshed = false;
    for (;;) {
      const token = await this.options.getAccessToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        });
      } catch {
        throw new GoogleApiError("network_error");
      } finally {
        clearTimeout(timer);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (response.ok) {
        if (body === null || typeof body !== "object") throw new GoogleApiError("bad_response", response.status);
        return body;
      }
      const error = classifyGoogleError(response.status, body, null);
      if (error.code === "unauthorized" && !refreshed && this.options.forceRefresh) {
        refreshed = true;
        this.options.forceRefresh();
        continue;
      }
      throw error;
    }
  }

  private static url(reviewName: string, suffix = ""): string {
    if (!REVIEW_NAME.test(reviewName)) throw new GoogleApiError("bad_response");
    return `${MY_BUSINESS_V4}/v4/${reviewName}${suffix}`;
  }

  /** The reply Google holds for one review right now (read before a write, to compare). */
  async getReview(reviewName: string): Promise<GoogleReplyState> {
    const body = (await this.call("GET", GoogleReplyClient.url(reviewName))) as { reviewReply?: unknown };
    const reply = body.reviewReply && typeof body.reviewReply === "object" ? (body.reviewReply as { comment?: unknown; updateTime?: unknown }) : null;
    const comment = reply && typeof reply.comment === "string" && reply.comment.trim().length > 0 ? reply.comment : null;
    return { comment, updateTime: comment && typeof reply?.updateTime === "string" ? reply.updateTime : null };
  }

  /** Create or replace the owner reply. Returns what Google recorded. */
  async putReply(reviewName: string, comment: string): Promise<{ comment: string; updateTime: string | null }> {
    const body = (await this.call("PUT", GoogleReplyClient.url(reviewName, "/reply"), { comment })) as { comment?: unknown; updateTime?: unknown };
    return {
      comment: typeof body.comment === "string" && body.comment.length > 0 ? body.comment : comment,
      updateTime: typeof body.updateTime === "string" ? body.updateTime : null,
    };
  }
}
