/**
 * THE WORK SCREENS THAT TAKE THE CHAT LOOK (approved 9 Oct 2026): a Tokyo
 * Green page header with the wave and the White logo, over the soft-tint
 * patterned canvas. History, the Knowledge Base, the Forms Register, the Form
 * Templates library, Reports and Analytics. The template EDITOR and a single
 * knowledge document stay plain: they are reading and typing surfaces.
 */
export function isBandPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/history" || pathname === "/knowledge") return true;
  if (pathname === "/forms/monitoring" || pathname === "/forms/templates") return true;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return true;
  if (pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/")) return true;
  return false;
}

/**
 * Which brand background the page canvas shows on a given route.
 *
 *   home   Home: the slightly more decorative level
 *   band   the band pages above: the soft Tokyo tint with the drawing
 *          pattern across the whole canvas, as on chat
 *   work   every other signed-in screen: quieter, edges only
 *   none   chat (which draws its own canvas) and the form editor, where
 *          people read and type for long stretches; the canvas stays plain
 *
 * The visual rules (opacity, edge mask, phones) live in globals.css under
 * BRAND BACKGROUNDS. This only decides the level.
 */
export type Backdrop = "home" | "band" | "work" | "none";

export function backdropForPath(pathname: string | null | undefined): Backdrop {
  if (!pathname || pathname === "/") return "home";
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "none";
  if (isBandPage(pathname)) return "band";
  // The template editor: /forms/templates/<key>, not the library itself.
  if (/^\/forms\/templates\/[^/]+/.test(pathname)) return "none";
  return "work";
}

/**
 * Which top bar the shell draws on a given route.
 *
 *   band    Home, Chat and the band pages: the page itself starts with a Tokyo
 *           Green header,
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
  if (isBandPage(pathname)) return "band";
  return "plain";
}
