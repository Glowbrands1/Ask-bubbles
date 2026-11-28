import { NAV_SECTIONS, visibleNavSections, type NavSection, type NavVisibility } from "@/components/shell/navigation";
import { REPORTS, REPORTS_DEFAULT_PATH } from "@/features/reports/reports-routes";

/**
 * ============================================================================
 * THE PAGES THE ASSISTANT'S ANSWERS LINK TO (Pau, 28 Nov 2026; port from Ask Sunny)
 * ============================================================================
 *
 * "make sure if sunny or bubble direct them to a page, make sure its clickable". When an answer names a page of the
 * app ("open the Forms Register", "it is on your Calendar"), `RichText` turns the name into a link to it, and a
 * `[label](/path)` the model writes becomes a link when the path is one of these pages.
 *
 * WHICH PAGES: exactly the ones this person's own sidebar shows (`visibleNavSections`, the rail's rule), plus their
 * meeting tabs, plus the pages reached from one of those (each report, Woven Employee Sync). So an answer never links
 * a page the person cannot open.
 *
 * DONE IN THE RENDERER, NOT ASKED OF THE MODEL, so it holds on every path the answer takes and for every way the model
 * words it. A name links only as the sidebar spells it (case and whole words). The assistant's own chat (`/chat`) is
 * not linked, and the sidebar labels that are everyday words ("Home", "History") link only as "Home page" and
 * "History page", so "Home address" or a form's "History:" line stays text.
 */
export interface PageLink {
  readonly href: string;
  /** The names an answer calls the page by, as the app spells them. */
  readonly names: readonly string[];
}

/** Other names an answer uses for a sidebar page. */
const ALSO_CALLED: Readonly<Record<string, readonly string[]>> = {
  "/": ["Home page"],
  "/history": ["History page"],
  "/ai-training": ["AI Training"],
};

/** Sidebar labels that are everyday words: linked only by their ALSO_CALLED names. */
const LABEL_NOT_LINKED = new Set(["/", "/history"]);

/** Pages reached from a sidebar entry: linked when that entry is in the person's sidebar. */
const REACHED_FROM: Readonly<Record<string, readonly PageLink[]>> = {
  [REPORTS_DEFAULT_PATH]: REPORTS.map((report) => ({ href: report.path, names: [report.label] })),
  "/admin/integrations": [{ href: "/admin/integrations/woven", names: ["Woven Employee Sync"] }],
};

/** Not linked: the chat the answer is in. */
const NOT_LINKED = new Set(["/chat"]);

export interface MeetingTab {
  readonly href: string;
  readonly label: string;
}

/** The pages this person's answers link to: their sidebar's, their meeting tabs (the first one also as "L10"), and the pages reached from them. */
export function pageLinksFor(visibility: NavVisibility, meetingTabs: readonly MeetingTab[] = [], sections: readonly NavSection[] = NAV_SECTIONS): PageLink[] {
  const links: PageLink[] = [];
  for (const section of visibleNavSections(visibility, sections)) {
    for (const item of section.items) {
      if (NOT_LINKED.has(item.href)) continue;
      links.push({ href: item.href, names: [...(LABEL_NOT_LINKED.has(item.href) ? [] : [item.label]), ...(ALSO_CALLED[item.href] ?? [])] });
      links.push(...(REACHED_FROM[item.href] ?? []));
    }
  }
  meetingTabs.forEach((tab, index) => {
    // "the L10" is how answers name the L10 meeting; it goes to the person's first meeting.
    links.push({ href: tab.href, names: index === 0 && /\bL10$/.test(tab.label) && tab.label !== "L10" ? [tab.label, "L10"] : [tab.label] });
  });
  return links.filter((link) => link.names.length > 0);
}
