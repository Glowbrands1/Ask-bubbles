import { AiError } from "@/lib/ai/errors";

/**
 * SAME-ORIGIN GUARD for cookie-authenticated, state-changing admin routes.
 *
 * A browser sends `Origin` on every cross-site POST and `Sec-Fetch-Site` on
 * every request, so a forged form or fetch from another site is refused even
 * though the session cookie rides along. Accepted: `Origin` whose host equals
 * the request's own host (`Host` / `X-Forwarded-Host` / the request URL), or,
 * with no `Origin`, `Sec-Fetch-Site: same-origin`. Everything else (missing
 * both, `cross-site`, `same-site`, a different host, an unparsable origin) is
 * refused with 403. Non-browser callers must send a matching `Origin`.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const own = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host).toLowerCase();

  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      host = null;
    }
    if (host !== null && host === own && fetchSite !== "cross-site") return;
  } else if (fetchSite === "same-origin") {
    return;
  }
  throw new AiError("bad_request", "This request did not come from the Ask Bubbles site, so it was refused.", 403, []);
}
