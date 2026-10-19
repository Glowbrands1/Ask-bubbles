import { describe, expect, it } from "vitest";

import { assertSameOrigin } from "./same-origin";

const req = (headers: Record<string, string>) => new Request("https://ask-bubbles.test/api/x", { method: "POST", headers });

describe("assertSameOrigin", () => {
  it("accepts an Origin whose host is the site's own", () => {
    expect(() => assertSameOrigin(req({ origin: "https://ask-bubbles.test", host: "ask-bubbles.test" }))).not.toThrow();
    expect(() => assertSameOrigin(req({ origin: "https://ask-bubbles.test", "x-forwarded-host": "ask-bubbles.test", host: "internal" }))).not.toThrow();
  });
  it("accepts no Origin only with Sec-Fetch-Site: same-origin", () => {
    expect(() => assertSameOrigin(req({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("refuses another site, a cross-site fetch, a same-site (sibling) origin, a bad origin, and a bare request", () => {
    for (const headers of <Record<string, string>[]>[
      { origin: "https://evil.example", host: "ask-bubbles.test" },
      { origin: "https://ask-bubbles.test", host: "ask-bubbles.test", "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { origin: "not a url", host: "ask-bubbles.test" },
      { origin: "null", host: "ask-bubbles.test" },
      {},
    ]) {
      expect(() => assertSameOrigin(req(headers)), JSON.stringify(headers)).toThrow(expect.objectContaining({ status: 403 }));
    }
  });
});
