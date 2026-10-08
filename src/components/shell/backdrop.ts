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
