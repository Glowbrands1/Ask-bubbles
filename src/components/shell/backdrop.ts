/**
 * Which brand background the page canvas shows on a given route.
 *
 *   home   Home: the slightly more decorative level
 *   work   every other signed-in screen: quieter, edges only
 *   none   chat and the form editor, where people read and type for long
 *          stretches; the canvas stays plain
 *
 * The visual rules (opacity, edge mask, phones) live in globals.css under
 * BRAND BACKGROUNDS. This only decides the level.
 */
export type Backdrop = "home" | "work" | "none";

export function backdropForPath(pathname: string | null | undefined): Backdrop {
  if (!pathname || pathname === "/") return "home";
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "none";
  // The template editor: /forms/templates/<key>, not the library itself.
  if (/^\/forms\/templates\/[^/]+/.test(pathname)) return "none";
  return "work";
}

/**
 * Which top bar the shell draws on a given route.
 *
 *   band    Home and Chat: the page itself starts with a Tokyo Green header,
 *           so there is no bar on desktop (the rail carries the Ask Bubbles
 *           logo and the page carries the Buff City Soap logo), and the
 *           phone/tablet bar is Tokyo Green so it runs straight into it
 *   plain   every other screen: the slim White bar with the Tokyo Green logo
 *
 * Approved 9 October 2026. Search moved from the bar to the rail on every
 * route, so no screen loses it.
 */
export type Chrome = "band" | "plain";

export function chromeForPath(pathname: string | null | undefined): Chrome {
  if (!pathname || pathname === "/") return "band";
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "band";
  return "plain";
}
