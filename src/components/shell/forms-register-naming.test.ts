import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NAV_SECTIONS } from "./navigation";

/**
 * ONE NAME FOR THE LIST OF FORMS. The navigation calls it the Forms Register,
 * and so does the assistant (`chat-form-records.ts`); the page and the inline
 * form card said "Form Monitoring", so a manager told to open one looked for
 * the other. The route (`/forms/monitoring`) and the code identifiers keep
 * their names — only what a person reads is checked here.
 */
const NAV_LABEL = NAV_SECTIONS.flatMap((section) => section.items).find(
  (item) => item.href === "/forms/monitoring",
)?.label;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The source without its comments: what is left is code, strings and JSX text. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("the Forms Register is called that everywhere a person reads it", () => {
  it("is the navigation's own label", () => {
    expect(NAV_LABEL).toBe("Forms Register");
  });

  it("titles its page with the navigation's label", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(app)/forms/monitoring/page.tsx"), "utf8");
    expect(page).toContain(`title: "${NAV_LABEL}"`);
    expect(page).toContain(`title="${NAV_LABEL}"`);
  });

  it("is never called Form Monitoring in anything shown to a person", () => {
    const offenders = sources(join(process.cwd(), "src")).filter((path) =>
      /form monitoring/i.test(withoutComments(readFileSync(path, "utf8")).replace(/\/\\bform monitoring\\b\//g, "")),
    );
    expect(offenders).toEqual([]);
  });
});
