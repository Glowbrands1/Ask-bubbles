import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * COLOUR HAS TO KEEP MEANING SOMETHING
 * ============================================================================
 *
 * The palette is two layers: RAW tokens (`--bcs-*`) hold values, SEMANTIC
 * aliases (`--background`, `--primary`, `--followup-attention`, …) hold
 * meanings, and components may only see meanings. That is what lets the
 * product be re-skinned in one file, and what lets a colour mean the same thing
 * everywhere it appears.
 *
 * A convention like that decays quietly. Somebody needs a card to stand out,
 * reaches for the nearest accent or pastes a hex, and a month later the
 * attention red means nothing. These tests are the mechanism that stops it:
 *
 *   1. THE RAW PALETTE HOLDS THE AGREED VALUES, so a "tidy-up" cannot shift a
 *      hue unnoticed.
 *   2. COMPONENTS NEVER SEE A RAW VALUE — neither a `--bcs-*` token nor its
 *      hex literal — and every token or utility they name actually exists.
 *   3. THE FOLLOW-UP COLOUR IS ONLY USED ON FOLLOW-UP SURFACES.
 *   4. THE KEY TEXT PAIRINGS CLEAR WCAG AA, computed from the token values
 *      rather than asserted in a comment.
 */

const SOURCE_DIR = join(process.cwd(), "src");
const GLOBALS = readFileSync(join(SOURCE_DIR, "app", "globals.css"), "utf8");
/** globals.css with its comments removed, so prose cannot satisfy a check. */
const GLOBALS_CODE = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The agreed raw palette — the Buff City Soap 2023 Brand Guidelines' main
 * colours ("Color codes", p.30) and the two scent colours the UI uses for
 * status, plus the one derived ink the follow-up fill depends on.
 */
const PALETTE = {
  "--bcs-tokyo": "#66c9ba",
  "--bcs-tokyo-dark": "#3e7f75",
  "--bcs-charcoal": "#3d3a38",
  "--bcs-cotton": "#f6f6f6",
  "--bcs-cloud": "#dfdfde",
  "--bcs-love-potion": "#e5554f",
  "--bcs-beast": "#ffa06a",
  // Derived: 65% Love Potion + 35% Charcoal — white on Love Potion is 3.66:1.
  "--bcs-attention": "#aa4c47",
} as const;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (
      /\.(ts|tsx|css)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      out.push(path);
    }
  }
  return out;
}

/** Code with comments stripped, so prose cannot satisfy or fail an assertion. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/** The body of the top-level `:root { … }` block. */
function rootBlock(): string {
  const start = GLOBALS_CODE.indexOf(":root {");
  expect(start, ":root is declared").toBeGreaterThan(-1);
  let depth = 0;
  for (let at = start; at < GLOBALS_CODE.length; at += 1) {
    if (GLOBALS_CODE[at] === "{") depth += 1;
    if (GLOBALS_CODE[at] === "}") {
      depth -= 1;
      if (depth === 0) return GLOBALS_CODE.slice(start, at);
    }
  }
  throw new Error(":root is not closed");
}

/** Every custom property declared in `:root`, name -> raw value. */
const ROOT: ReadonlyMap<string, string> = new Map(
  [...rootBlock().matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]),
);

/** Every `--color-*` the Tailwind theme exposes as a utility colour. */
const THEME_COLOURS: ReadonlySet<string> = new Set(
  [...GLOBALS_CODE.matchAll(/^\s*--color-([a-z0-9-]+)\s*:/gim)].map((m) => m[1]),
);

/** Follows a token's `var()` chain down to a hex value. */
function resolveHex(token: string, seen: string[] = []): string {
  if (seen.includes(token)) throw new Error(`${token} is circular: ${seen.join(" -> ")}`);
  const value = ROOT.get(token);
  if (value === undefined) throw new Error(`${token} is not declared in :root`);
  const reference = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value);
  if (reference) return resolveHex(reference[1], [...seen, token]);
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  throw new Error(`${token} does not resolve to a plain hex colour (${value})`);
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/* ================================================== the raw palette ===== */

describe("the raw palette is present and unaltered", () => {
  it("pins every agreed --bcs value", () => {
    for (const [token, value] of Object.entries(PALETTE)) {
      expect(ROOT.get(token), `${token} moved or is missing`).toBe(value);
    }
  });

  it("gives each meaning a semantic alias, so components never use a raw value", () => {
    for (const alias of [
      "--background",
      "--foreground",
      "--primary",
      "--primary-foreground",
      "--accent",
      "--accent-foreground",
      "--followup-attention",
      "--glow-accent",
      "--brand-accent",
      "--brand-accent-foreground",
      "--topbar",
      "--rail",
      "--sidebar",
      "--selected",
      "--hover-surface",
    ]) {
      expect(ROOT.has(alias), `${alias} is missing`).toBe(true);
    }
  });

  it("points the settled meanings at the palette they were agreed on", () => {
    expect(ROOT.get("--background")).toBe("var(--bcs-cotton)");
    expect(ROOT.get("--foreground")).toBe("var(--bcs-charcoal)");
    // The CTA fill is Dark Tokyo Green: Tokyo Green never carries white text.
    expect(ROOT.get("--primary")).toBe("var(--bcs-tokyo-dark)");
    expect(ROOT.get("--brand-accent")).toBe("var(--bcs-tokyo)");
    expect(ROOT.get("--accent")).toBe("var(--bcs-tokyo)");
    expect(ROOT.get("--followup-attention")).toBe("var(--bcs-attention)");
    expect(ROOT.get("--rail")).toBe("var(--bcs-charcoal)");
    expect(resolveHex("--rail")).toBe(PALETTE["--bcs-charcoal"]);
    // Chart data is teal — never the attention red, so a bar is never an alarm.
    expect(resolveHex("--measure-data")).not.toBe(resolveHex("--followup-attention"));
  });

  it("keeps the retired token names out of the system", () => {
    /*
     * `--brand-yellow` became `--brand-accent` and `--wellness-redlight`
     * became `--glow-accent`. A survivor under the old name — as a token or as
     * a Tailwind theme colour — is a second name for one meaning.
     */
    for (const retired of ["brand-yellow", "wellness-redlight"]) {
      expect(GLOBALS_CODE, `${retired} is still declared`).not.toMatch(
        new RegExp(`--(color-)?${retired}\\b`),
      );
      const users = sourceFiles(SOURCE_DIR).filter((path) =>
        new RegExp(`\\b${retired}\\b`).test(codeOf(path)),
      );
      expect(users, `${retired} is still used`).toEqual([]);
    }
  });
});

/* ======================================= components see only meanings === */

describe("components never see a raw palette value", () => {
  it("keeps raw --bcs tokens out of every component", () => {
    const offenders = sourceFiles(SOURCE_DIR)
      .filter((path) => !path.endsWith("globals.css"))
      .filter((path) => /--bcs-/.test(codeOf(path)));

    expect(offenders, "components must use semantic tokens, not raw palette values").toEqual([]);
  });

  it("keeps the raw palette's hex literals out of every component", () => {
    /*
     * A hardcoded hex is the same defect as using the raw token, minus the
     * traceability. Every hex the raw palette declares is checked, not only the
     * pinned ones.
     *
     * ONE LEGITIMATE EXCEPTION, and it is a platform limitation rather than a
     * shortcut: `<meta name="theme-color">` is read by the browser before any
     * stylesheet is parsed, so it cannot resolve a CSS variable. The canvas
     * colour therefore appears literally in the viewport metadata, and it is
     * asserted to be the canvas — a DIFFERENT literal there would mean the
     * browser chrome no longer matches the page it frames.
     */
    const literals = [
      ...new Set(
        [...ROOT.entries()]
          .filter(([token, value]) => token.startsWith("--bcs-") && /^#[0-9a-f]{6}$/i.test(value))
          .map(([, value]) => value.toLowerCase())
          // Pure white is not a brand colour; it is the absence of one.
          .filter((value) => value !== "#ffffff"),
      ),
    ];
    expect(literals.length).toBeGreaterThan(Object.keys(PALETTE).length);

    const canvas = PALETTE["--bcs-cotton"];
    const offenders = sourceFiles(SOURCE_DIR)
      .filter((path) => !path.endsWith("globals.css"))
      .flatMap((path) => {
        const code = codeOf(path).toLowerCase();
        const found = literals.filter((value) =>
          new RegExp(`${value}(?![0-9a-f])`).test(code),
        );
        if (found.length === 0) return [];
        if (path.endsWith(join("app", "layout.tsx"))) {
          const onlyThemeColour =
            found.length === 1 &&
            found[0] === canvas &&
            new RegExp(`themecolor:\\s*"${canvas}"`).test(code) &&
            code.split(canvas).length === 2;
          if (onlyThemeColour) return [];
        }
        return [`${path} -> ${found.join(", ")}`];
      });

    expect(offenders, "colours belong in globals.css, not inline").toEqual([]);
  });

  it("sets the browser theme colour to the canvas", () => {
    const layout = codeOf(join(SOURCE_DIR, "app", "layout.tsx"));
    expect(layout).toContain(`themeColor: "${PALETTE["--bcs-cotton"]}"`);
  });
});

describe("every colour a component names actually exists", () => {
  /**
   * An unresolvable `var()` is not a no-op with a fallback. In an SVG
   * presentation attribute it is an INVALID value, so a chart handed
   * `fill="var(--deleted-token)"` renders in the initial colour (black) and a
   * benchmark line silently does not draw — while the file compiles, the types
   * pass and lint is clean.
   */
  it("resolves every var(--token) against globals.css", () => {
    const defined = new Set(
      [...GLOBALS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]),
    );

    const unresolved: string[] = [];
    for (const path of sourceFiles(SOURCE_DIR)) {
      if (path.endsWith("globals.css")) continue;
      const code = codeOf(path);
      /*
       * A file may declare its own custom property and read it back, so
       * locally declared names count as defined for that file and nowhere
       * else. `next/font` declares the font variables at runtime.
       */
      const local = new Set(
        [...code.matchAll(/(?:^|["'{,\s])(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]),
      );
      for (const match of code.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const token = match[1];
        if (defined.has(token) || local.has(token)) continue;
        unresolved.push(`${path} -> ${token}`);
      }
    }

    expect(
      unresolved,
      "a var() with no declaration is an invalid value, not a fallback",
    ).toEqual([]);
  });

  it("gives every semantic colour a component uses as a utility a theme colour", () => {
    /*
     * THE SAME FAILURE, ONE LAYER UP. `bg-brand-accent` only generates CSS if
     * the Tailwind theme declares `--color-brand-accent`. A semantic token that
     * was renamed in `:root` but not in `@theme` leaves every utility naming it
     * as an unstyled class — no error, no warning, just a missing colour.
     */
    const utility =
      /(?<![\w-])(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|outline|decoration|divide|from|via|to|caret|placeholder)-([a-z][a-z0-9-]*)/g;

    const missing = new Set<string>();
    let checked = 0;
    for (const path of sourceFiles(SOURCE_DIR)) {
      if (!/\.(ts|tsx)$/.test(path)) continue;
      for (const match of codeOf(path).matchAll(utility)) {
        const name = match[1];
        if (!ROOT.has(`--${name}`)) continue;
        checked += 1;
        if (!THEME_COLOURS.has(name)) missing.add(`${match[0]} (${path.slice(SOURCE_DIR.length + 1)})`);
      }
    }

    expect(checked, "semantic colour utilities were actually found").toBeGreaterThan(50);
    expect([...missing], "utility names a colour the theme does not expose").toEqual([]);
  });
});

/* ============================================== the follow-up colour ==== */

describe("the follow-up colour means follow-ups", () => {
  /** Every non-test file that mentions the follow-up colour in code. */
  function usesFollowupColour(): string[] {
    return sourceFiles(SOURCE_DIR)
      .filter((path) => !path.endsWith("globals.css"))
      .filter((path) => /followup-attention/.test(codeOf(path)));
  }

  it("is used somewhere — a token nobody uses is not a design system", () => {
    expect(usesFollowupColour().length).toBeGreaterThan(0);
  });

  it("appears ONLY on files that deal with follow-ups", () => {
    /*
     * Any file painting something with the follow-up colour must also be about
     * follow-ups — overdue, late, due. `badge.tsx` and `marquee.tsx` are
     * allowed as the shared definitions of the tone and the alarm bar; every
     * other user has to justify itself by its own content.
     */
    const definitions = [
      join("components", "ui", "badge.tsx"),
      join("components", "ui", "marquee.tsx"),
    ];

    for (const path of usesFollowupColour()) {
      if (definitions.some((definition) => path.endsWith(definition))) continue;
      const code = codeOf(path).toLowerCase();
      const aboutFollowUps =
        /follow-?up/.test(code) || /overdue/.test(code) || /needsattention/.test(code);
      expect(
        aboutFollowUps,
        `${path} uses the follow-up colour but is not about follow-ups`,
      ).toBe(true);
    }
  });

  it("is not applied to any reporting surface", () => {
    /*
     * Reporting is where the temptation is greatest — a figure that "needs
     * attention" is a judgement the data does not make, and colouring it with
     * the follow-up red would claim somebody has to act on it.
     */
    const reporting = sourceFiles(join(SOURCE_DIR, "features", "reports")).concat(
      sourceFiles(join(SOURCE_DIR, "lib", "reporting")),
    );
    expect(reporting.length).toBeGreaterThan(0);
    const offenders = reporting.filter((path) => /followup-attention/.test(codeOf(path)));
    expect(offenders, "report figures are not follow-ups").toEqual([]);
  });

  it("never becomes a primary action", () => {
    /* Pressing must not look like alarming. */
    const button = codeOf(join(SOURCE_DIR, "components", "ui", "button.tsx"));
    for (const fill of ["bg-followup-attention", "bg-measure-flagged"]) {
      expect(button, `${fill} is not a button fill`).not.toContain(fill);
    }
  });

  it("is not the generic selected colour either", () => {
    const selected = ROOT.get("--selected") ?? "";
    expect(selected).not.toBe("");
    expect(resolveHex("--selected")).not.toBe(resolveHex("--followup-attention"));
    expect(resolveHex("--selected")).not.toBe(resolveHex("--glow-accent"));
  });
});

/* ================================================ WCAG AA contrast ====== */

describe("the key text pairings clear WCAG AA", () => {
  /*
   * COMPUTED FROM THE TOKENS, not copied from a comment. Each pairing is a
   * foreground token on the ground it is drawn on; both are followed through
   * their `var()` chains to the raw hex, so re-pointing an alias or moving a
   * raw value is measured here the moment it happens.
   */
  const PAIRINGS: readonly [foreground: string, background: string][] = [
    ["--foreground", "--background"],
    ["--muted-foreground", "--background"],
    ["--muted-foreground", "--surface-muted"],
    ["--muted-foreground", "--surface"],
    ["--primary-foreground", "--primary"],
    ["--sidebar-foreground", "--sidebar"],
    ["--sidebar-muted", "--sidebar"],
    ["--sidebar-active-foreground", "--sidebar-active"],
    ["--accent-foreground", "--accent"],
    ["--accent-soft-foreground", "--accent-soft"],
    ["--followup-attention-foreground", "--followup-attention"],
    ["--followup-attention-soft-foreground", "--followup-attention-soft"],
    ["--brand-accent-foreground", "--brand-accent"],
    ["--selected-foreground", "--selected"],
    // The Tokyo Green band and everything written on it.
    ["--band-foreground", "--band"],
    ["--band-muted-foreground", "--band"],
    // Teal text (links, the wordmark's trail) on the grounds it sits on.
    ["--primary", "--surface"],
    ["--primary-foreground", "--primary-hover"],
    ["--primary-soft-foreground", "--primary-soft"],
    ["--status-attention", "--status-attention-bg"],
    ["--status-failed", "--status-failed-bg"],
  ];

  it.each(PAIRINGS)("%s on %s is at least 4.5:1", (foreground, background) => {
    const ratio = contrast(resolveHex(foreground), resolveHex(background));
    expect(
      ratio,
      `${foreground} (${resolveHex(foreground)}) on ${background} (${resolveHex(background)}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * ICONS, not text: WCAG 1.4.11 asks 3:1 of a graphic against what it sits
   * on. The rating stars are the icon whose meaning is its colour.
   */
  const ICON_PAIRINGS: readonly [foreground: string, background: string][] = [
    ["--rating-star", "--surface"],
    ["--rating-star", "--background"],
    ["--rating-star-empty", "--surface"],
    ["--rating-star-empty", "--background"],
  ];

  it.each(ICON_PAIRINGS)("%s on %s is at least 3:1", (foreground, background) => {
    const ratio = contrast(resolveHex(foreground), resolveHex(background));
    expect(
      ratio,
      `${foreground} (${resolveHex(foreground)}) on ${background} (${resolveHex(background)}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("never draws a rating star in Tokyo Green alone", () => {
    // The defect this replaced: Tokyo Green stars, 1.98:1 on White.
    expect(contrast(PALETTE["--bcs-tokyo"], "#ffffff")).toBeLessThan(3);
    for (const file of [
      "src/features/chat/conversation-rating.tsx",
      "src/features/admin/analytics/feedback-queue.tsx",
      "src/features/admin/analytics/feedback-summary.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("text-rating-star");
      expect(source, file).not.toMatch(/fill-brand-accent text-brand-accent/);
    }
  });

  it("measures contrast the way WCAG does", () => {
    // Guard on the guard: black on white is 21:1 and a colour on itself is 1:1.
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#3d3a38", "#3d3a38")).toBeCloseTo(1, 5);
    // And these are the reasons for the derived shades: white text fails on
    // Tokyo Green and on Love Potion, so neither ever carries it.
    expect(contrast("#ffffff", PALETTE["--bcs-tokyo"])).toBeLessThan(4.5);
    expect(contrast("#ffffff", PALETTE["--bcs-love-potion"])).toBeLessThan(4.5);
  });
});

/* ======================================================== typography ==== */

describe("typography keeps the display face out of body copy", () => {
  it("loads both fallback faces through next/font", () => {
    const layout = readFileSync(join(SOURCE_DIR, "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/import \{[^}]*\bArchivo\b[^}]*\} from "next\/font\/google"/);
    expect(layout).toMatch(/import \{[^}]*\bFigtree\b[^}]*\} from "next\/font\/google"/);
    // Self-hosted at build time, and text stays visible while a face loads.
    expect((layout.match(/display: "swap"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(layout).toContain('variable: "--font-archivo"');
    expect(layout).toContain('variable: "--font-figtree"');
  });

  it("names the licensed brand faces first, so they win wherever installed", () => {
    /*
     * The 2023 guidelines: Supria Sans Black for headlines, Avenir Next Regular
     * for sub-headlines and body. Archivo and Figtree are the labelled
     * stand-ins until the licensed files are self-hosted.
     */
    const stackOf = (token: string) => new RegExp(`${token}:([^;]+);`).exec(GLOBALS_CODE)?.[1] ?? "";
    expect(stackOf("--font-display").trim()).toMatch(/^"Supria Sans",/);
    expect(stackOf("--font-sans").trim()).toMatch(/^"Avenir Next",/);
  });

  it("sets the wordmark and the greetings in the approved lettering face, and nothing else", () => {
    /*
     * Approved 9 Oct 2026: hand-lettered caps for the Ask Bubbles wordmark
     * (option B) and the rounded hand-lettered greeting (option 2), both in
     * Grandstander (OFL), self-hosted. It is inspired by the Buff City Soap
     * logo, not a brand headline or body face, so it is confined to the
     * wordmark and the two greeting headlines.
     */
    const stackOf = (token: string) => new RegExp(`${token}:([^;]+);`).exec(GLOBALS_CODE)?.[1] ?? "";
    expect(stackOf("--font-wordmark").trim()).toMatch(/^var\(--font-grandstander\),/);
    expect(stackOf("--font-lettering").trim()).toMatch(/^var\(--font-grandstander\),/);

    const layout = readFileSync(join(SOURCE_DIR, "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/import \{[^}]*\bGrandstander\b[^}]*\} from "next\/font\/google"/);
    expect(layout).toContain('variable: "--font-grandstander"');
    expect((layout.match(/display: "swap"/g) ?? []).length).toBeGreaterThanOrEqual(3);

    // Used by the wordmark and the two greeting headlines only.
    const users = sourceFiles(SOURCE_DIR)
      .filter((path) => /\.tsx$/.test(path))
      .filter((path) => /\bdisplay-lettering\b/.test(codeOf(path)))
      .map((path) => path.slice(path.indexOf("src/")))
      .sort();
    // Plus the band page headers (9 Oct 2026: "apply the same header" to the
    // work screens), drawn once in PageHeader and once in ReportBand.
    expect(users).toEqual([
      "src/components/ui/layout.tsx",
      "src/features/chat/chat-screen.tsx",
      "src/features/dashboard/ask-band.tsx",
      "src/features/reports/report-frame.tsx",
    ]);
  });

  it("drives UI text with the readable face, not the display one", () => {
    /*
     * Supria Sans (stand-in: Archivo) is a headline face: right for a heading or a wordmark, wrong for
     * a paragraph, a label or a table cell. `--font-sans` is what all of those
     * resolve to, so it must never point at it.
     */
    const sans = /--font-sans:([^;]+);/.exec(GLOBALS_CODE)?.[1] ?? "";
    expect(sans).toContain("--font-figtree");
    expect(sans).not.toContain("archivo");
    expect(sans).not.toContain("Supria");

    expect(/--font-display:([^;]+);/.exec(GLOBALS_CODE)?.[1] ?? "").toContain("--font-archivo");
    expect(sans).not.toContain("grandstander");

    // The body element itself is set in the readable face.
    const body = /\n\s*body \{([^}]+)\}/.exec(GLOBALS_CODE)?.[1] ?? "";
    expect(body).toContain("font-family: var(--font-sans)");

    // The small all-caps UI furniture is the readable face too.
    for (const rule of ["eyebrow", "pill-action"]) {
      const block = new RegExp(`\\.${rule} \\{([^}]+)\\}`).exec(GLOBALS_CODE)?.[1] ?? "";
      expect(block, `.${rule} is missing`).not.toBe("");
      expect(block, `.${rule} uses the display face`).toContain("var(--font-sans)");
    }
  });

  it("gives every face a real fallback stack", () => {
    for (const token of ["--font-sans", "--font-display", "--font-wordmark", "--font-lettering"]) {
      const stack = new RegExp(`${token}:([^;]+);`).exec(GLOBALS_CODE)?.[1] ?? "";
      expect(stack, `${token} has no fallback`).toMatch(/sans-serif|system-ui/);
    }
  });

  it("holds the display vocabulary components are drawn in", () => {
    /*
     * Components reference these classes by name, so a rename is a silent
     * unstyling — every one of them would still compile and still render, just
     * as unstyled text.
     */
    for (const rule of [
      ".display {",
      ".display-figure {",
      ".wordmark {",
      ".wordmark-letter {",
      ".display-lettering {",
      ".eyebrow {",
      ".pill-action {",
      ".stat-cell {",
      ".stat-grid {",
    ]) {
      expect(GLOBALS_CODE, `${rule} is missing`).toContain(rule);
    }
    const figure = /\.display-figure \{([^}]+)\}/.exec(GLOBALS_CODE)?.[1] ?? "";
    expect(figure).toContain("tabular-nums");
  });
});

/* ============================================================= brand ==== */

describe("the Ask Bubbles brand", () => {
  const APP_SHELL = codeOf(join(SOURCE_DIR, "components", "shell", "app-shell.tsx"));
  const BRAND = codeOf(join(SOURCE_DIR, "components", "brand-mark.tsx"));

  it("puts the top bar in the SHELL, not on one page", () => {
    expect(APP_SHELL).toContain("bg-chrome");
    expect(APP_SHELL).toContain("<header");
    // The parent brand's official logo, not a typeset stand-in.
    expect(APP_SHELL).toContain("<BuffCitySoapLogo");

    const reportingPages = sourceFiles(join(SOURCE_DIR, "app")).filter((path) =>
      path.includes("reports"),
    );
    const localBars = reportingPages.filter((path) =>
      /bg-(chrome|topbar|band)\b/.test(codeOf(path)),
    );
    expect(localBars, "the top bar is the shell's, not a page's").toEqual([]);
  });

  it("keeps the follow-up alert's action readable on its own pill", () => {
    /*
     * Reported 9 Oct 2026: "Open the forms register" was White on a White
     * pill (the alarm's own ink), so it only showed when selected. The pill's
     * text and ground are read from its class list and must clear 4.5:1.
     */
    const marquee = codeOf(join(SOURCE_DIR, "components", "ui", "marquee.tsx"));
    const alarm = marquee.slice(marquee.indexOf("export function AlarmBar"));
    const pill = /className="(pill-action[^"]*)"/.exec(alarm)?.[1] ?? "";
    expect(pill).not.toBe("");
    const ground = /(?:^|\s)bg-([a-z-]+)/.exec(pill)?.[1];
    const ink = /(?:^|\s)text-([a-z-]+)/.exec(pill)?.[1];
    expect(ground && ink, pill).toBeTruthy();
    expect(contrast(resolveHex(`--${ink}`), resolveHex(`--${ground}`))).toBeGreaterThanOrEqual(4.5);
  });

  it("draws the bubble mark as a vector, never an emoji", () => {
    /*
     * An emoji renders as whatever the viewer's OS ships — a different glyph on
     * every platform, none of them in the brand colours.
     */
    expect(BRAND).toContain("export function BubbleMark");
    expect(BRAND).toContain("<svg");
    expect(BRAND).toContain("<circle");
    expect(BRAND).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("colours the mark and the wordmark from the brand tokens", () => {
    expect(BRAND).toContain("var(--brand-accent)");
    expect(BRAND).toContain("var(--accent)");
    // Tokyo Green is text only on the Charcoal rail (5.71:1); on a light
    // ground the trail word takes Dark Tokyo Green.
    expect(BRAND).toContain("text-brand-accent");
    expect(BRAND).toContain("text-primary");
    // On the rail the lead word takes the rail's own foreground.
    expect(BRAND).toContain("text-sidebar-foreground");
    // And the words come from the brand config, not from this file.
    expect(BRAND).toContain("ACTIVE_BRAND.wordmark.lead");
    expect(BRAND).toContain("ACTIVE_BRAND.wordmark.trail");
  });

  it("shows one wordmark at a time", () => {
    /*
     * The rail leads with the Ask Bubbles logo on desktop; the top bar repeats
     * the wordmark only below `lg`, where the rail is a closed drawer.
     */
    const sidebar = codeOf(join(SOURCE_DIR, "components", "shell", "sidebar.tsx"));
    expect(sidebar).toMatch(/<BrandMark[^>]*\bstacked\b/);
    expect(APP_SHELL).toMatch(/className="shrink-0 lg:hidden"\s*>\s*<BrandMark/);
  });

  it("uses the selected token for generic selected state", () => {
    // Charcoal: a chosen filter, a pressed segment, the ink button.
    expect(ROOT.get("--selected")).toBe("var(--bcs-charcoal)");
    const button = readFileSync(join(SOURCE_DIR, "components", "ui", "button.tsx"), "utf8");
    expect(button).toContain("bg-selected");
  });

  it("gives every control a hover drawn from the tokens", () => {
    /*
     * Asserted through TOKENS rather than hex values, because that is what
     * keeps them in step with the palette.
     *
     * LIGHT CONTROLS lift to the one hover surface, the Tokyo tint, so "the
     * pointer is on this" reads the same on a bordered secondary, an outline
     * and a bare ghost. DARK FILLS (primary, ink, accent, destructive) step to
     * their own darker or lighter shade instead — fading a dark button to a
     * pale tint would leave white text on white.
     */
    expect(ROOT.get("--hover-surface")).toBe("var(--bcs-tokyo-tint)");

    const button = readFileSync(join(SOURCE_DIR, "components", "ui", "button.tsx"), "utf8");
    const sidebar = codeOf(join(SOURCE_DIR, "components", "shell", "sidebar.tsx"));

    /*
     * EVERY VARIANT, checked one by one. `link` is the one exception: it is
     * text with an underline, not a surface, so it has no background to hover.
     */
    const variantGroup = /variant:\s*\{([\s\S]*?)\n      \},/.exec(button)?.[1] ?? "";
    expect(variantGroup).not.toBe("");
    const entries = [
      ...variantGroup.matchAll(/^\s{8}(\w+):\s*(?:\n\s+)?((?:"[^"]*")+)/gm),
    ].map((m) => ({ name: m[1], classes: m[2] }));
    expect(entries.length).toBeGreaterThan(3);
    for (const entry of entries) {
      if (entry.name === "link") continue;
      const hovers = [...entry.classes.matchAll(/hover:bg-([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
      const mixed = /hover:bg-\[color-mix\(in_srgb,var\(--[a-z0-9-]+\)/.test(entry.classes);
      expect(hovers.length > 0 || mixed, `${entry.name} has no hover state`).toBe(true);
      for (const hover of hovers) {
        expect(THEME_COLOURS.has(hover), `${entry.name} hovers to an undeclared colour ${hover}`).toBe(true);
      }
    }
    for (const light of ["secondary", "ghost", "outline"]) {
      const entry = entries.find((candidate) => candidate.name === light);
      expect(entry?.classes, `${light} must hover to the shared hover surface`).toContain(
        "hover:bg-hover-surface",
      );
    }

    // The Charcoal rail hovers to its own lighter step, keeping white text.
    expect(sidebar).toContain("hover:bg-rail-hover");
    expect(sidebar).toContain("bg-sidebar-active");
  });

  it("keeps the rail's pill off surfaces it would vanish against", () => {
    /*
     * `--sidebar-active` is the pill that reads against the dark rail; on a
     * white card the same colour is invisible. The open conversation in the
     * chat list is marked with an accent edge instead.
     */
    const chat = codeOf(join(SOURCE_DIR, "features", "chat", "conversation-list.tsx"));
    expect(chat).not.toContain("bg-sidebar-active");
    expect(chat).toContain("border-l-brand-accent");
  });

  it("holds the status ladder, with a glyph on every rung", () => {
    /* Colour is never the only cue: each rung carries a glyph and a word. */
    for (const token of [
      "--status-outperforming",
      "--status-at-market",
      "--status-below-market",
      "--status-under",
      "--status-capacity",
    ]) {
      expect(ROOT.has(token), `${token} is missing`).toBe(true);
    }
    const chip = codeOf(join(SOURCE_DIR, "components", "ui", "marquee.tsx"));
    expect(chip, "the ladder has no shared chip").toContain("StatusChip");
    for (const glyph of ["▲", "●", "▬", "▼", "◇"]) {
      expect(chip, `the ${glyph} rung lost its glyph`).toContain(glyph);
    }
  });

  it("leaves the chart series on the data colour, not the selection colour", () => {
    /*
     * Bars encode DATA. Painting them with the selected-state colour would say
     * every bar is selected.
     */
    const palette = codeOf(join(SOURCE_DIR, "features", "reports", "kit", "chart-palette.ts"));
    expect(palette).toContain('SERIES_PRIMARY = "var(--measure-data)"');
    expect(palette).not.toContain("--selected");
    expect(palette).not.toContain("followup-attention");
    // The brand orange never encodes a value.
    expect(palette).not.toContain("brand-accent");
  });
});

/* ============================================== brand backgrounds ======= */

describe("the brand backgrounds stay decorative", () => {
  /*
   * THE APPROVED "EDGE-WEIGHTED" OPTION, made stronger on 9 Oct 2026: the
   * official product drawings behind the sidebar, the page canvas, the chat
   * canvas and the Home band. These tests hold the line the approvals drew:
   * text stays readable even where it lands on a line, the editor stays
   * plain, and none of it takes a click or reaches assistive technology.
   */
  const opacity = (token: string) => {
    const value = Number.parseFloat(ROOT.get(token) ?? "");
    expect(value, `${token} is declared as a number`).toBeGreaterThan(0);
    return value;
  };

  /** One drawing's line, `alpha` of `ink` over `ground`, as a hex colour. */
  function onLine(ink: string, ground: string, alpha: number): string {
    const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
    return (
      "#" +
      [1, 3, 5]
        .map((at) => Math.round(alpha * channel(ink, at) + (1 - alpha) * channel(ground, at)))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  it("keeps each layer under its approved ceiling", () => {
    expect(opacity("--pattern-sidebar-opacity")).toBeLessThanOrEqual(0.07);
    expect(opacity("--pattern-canvas-opacity")).toBeLessThanOrEqual(0.22);
    expect(opacity("--pattern-canvas-home-opacity")).toBeLessThanOrEqual(0.22);
    expect(opacity("--pattern-chat-opacity")).toBeLessThanOrEqual(0.22);
    expect(opacity("--hero-art-max-opacity")).toBeLessThanOrEqual(0.32);
  });

  it("keeps sidebar text readable even on a pattern line", () => {
    // The sidebar drawings are White.
    const line = onLine("#ffffff", resolveHex("--sidebar"), opacity("--pattern-sidebar-opacity"));
    expect(contrast(resolveHex("--sidebar-foreground"), line)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveHex("--sidebar-muted"), line)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps canvas text readable even on a pattern line", () => {
    // The canvas drawings are the two greens; Dark Tokyo Green is the worst case.
    for (const token of ["--pattern-canvas-opacity", "--pattern-canvas-home-opacity"]) {
      const line = onLine(PALETTE["--bcs-tokyo-dark"], resolveHex("--background"), opacity(token));
      expect(contrast(resolveHex("--foreground"), line), token).toBeGreaterThanOrEqual(4.5);
      expect(contrast(resolveHex("--muted-foreground"), line), token).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps Charcoal readable on the chat canvas, even on a pattern line", () => {
    // Every word on the chat canvas is Charcoal or sits on White.
    const line = onLine(
      PALETTE["--bcs-tokyo-dark"],
      resolveHex("--chat-canvas"),
      opacity("--pattern-chat-opacity"),
    );
    expect(contrast(resolveHex("--foreground"), line)).toBeGreaterThanOrEqual(4.5);
    // The canvas is a tint of Tokyo Green, not a new hue.
    expect(ROOT.get("--chat-canvas")).toBe("var(--bcs-tokyo-mist)");
  });

  it("only lightens the Home band behind its Charcoal text", () => {
    const line = onLine("#ffffff", resolveHex("--band"), opacity("--hero-art-max-opacity"));
    expect(contrast(resolveHex("--band-foreground"), line)).toBeGreaterThanOrEqual(
      contrast(resolveHex("--band-foreground"), resolveHex("--band")),
    );
  });

  it("never takes a click and hides for high contrast, forced colours and print", () => {
    const block = (selector: string) => {
      const at = GLOBALS_CODE.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return GLOBALS_CODE.slice(at, GLOBALS_CODE.indexOf("}", at));
    };
    expect(block(".rail-pattern::before")).toContain("pointer-events: none");
    expect(block(".canvas-pattern")).toContain("pointer-events: none");
    expect(block(".chat-pattern")).toContain("pointer-events: none");
    expect(block(".hero-art")).toContain("pointer-events: none");
    expect(GLOBALS_CODE).toMatch(
      /@media \(forced-colors: active\), \(prefers-contrast: more\), print \{\s*\.rail-pattern::before,\s*\.canvas-pattern,\s*\.chat-pattern,\s*\.hero-art \{\s*display: none;/,
    );
  });

  it("keeps phones' page canvas and the form editor plain, except on the band pages", () => {
    expect(GLOBALS_CODE).toMatch(
      /@media \(max-width: 767px\) \{\s*\.canvas-pattern:not\(\[data-backdrop="band"\]\) \{\s*display: none;/,
    );
    expect(GLOBALS_CODE).toMatch(/\.canvas-pattern\[data-backdrop="none"\] \{\s*display: none;/);
  });

  it("gives the band pages the chat canvas, with readable grey ink", () => {
    // The whole canvas, at the chat opacity, with no edge fade.
    const band = /\.canvas-pattern\[data-backdrop="band"\] \{([^}]+)\}/.exec(GLOBALS_CODE)?.[1] ?? "";
    expect(band).toContain("opacity: var(--pattern-chat-opacity)");
    expect(band).toContain("mask-image: none");
    // Grey ink becomes body ink there, and holds 4.5:1 on a drawing line.
    const scope = /\[data-canvas="band"\] \{([^}]+)\}/.exec(GLOBALS_CODE)?.[1] ?? "";
    expect(scope).toContain("--muted-foreground: var(--bcs-ink-body)");
    expect(scope).toContain("--subtle-foreground: var(--bcs-ink-body)");
    const line = onLine(
      PALETTE["--bcs-tokyo-dark"],
      resolveHex("--chat-canvas"),
      opacity("--pattern-chat-opacity"),
    );
    expect(contrast(resolveHex("--bcs-ink-body"), line)).toBeGreaterThanOrEqual(4.5);

    const shell = codeOf(join(SOURCE_DIR, "components", "shell", "app-shell.tsx"));
    expect(shell).toContain('backdrop === "band" ? "bg-chat-canvas" : "bg-background"');
    expect(shell).toContain('data-canvas={backdrop === "band" ? "band" : undefined}');
    expect(shell).toContain('<main id="main" className="min-w-0 flex-1 overflow-x-clip">');
  });

  it("keeps the hero and chat drawings behind their content", () => {
    // Painted below the content of an isolated parent, so text and controls
    // always sit over them.
    const block = (selector: string) => {
      const at = GLOBALS_CODE.indexOf(`${selector} {`);
      return GLOBALS_CODE.slice(at, GLOBALS_CODE.indexOf("}", at));
    };
    expect(block(".hero-art")).toContain("z-index: -1");
    expect(block(".chat-pattern")).toContain("z-index: -1");
    // Phones keep only the line-up and the spray bottle in the band.
    expect(GLOBALS_CODE).toMatch(
      /@media \(max-width: 639px\) \{[\s\S]*?\.hero-art-bomb,\s*\.hero-art-bar,\s*\.hero-art-tub \{\s*display: none;/,
    );
  });

  it("is wired into the shell, the sidebar, the Home band and the chat as decoration", () => {
    const shell = codeOf(join(SOURCE_DIR, "components", "shell", "app-shell.tsx"));
    expect(shell).toContain("const backdrop = backdropForPath(pathname);");
    expect(shell).toContain('<div aria-hidden className="canvas-pattern" data-backdrop={backdrop} />');
    // The page column sits above the fixed layer.
    expect(shell).toContain('className="relative z-[1] flex min-w-0 flex-1 flex-col"');
    const sidebar = codeOf(join(SOURCE_DIR, "components", "shell", "sidebar.tsx"));
    expect(sidebar).toContain('className="rail-pattern relative isolate flex h-full flex-col bg-sidebar"');
    const band = codeOf(join(SOURCE_DIR, "features", "dashboard", "ask-band.tsx"));
    expect(band).toContain('<div aria-hidden className="hero-art">');
    expect(band).toMatch(/className="wave-edge relative isolate [^"]*bg-band/);
    const chat = codeOf(join(SOURCE_DIR, "features", "chat", "chat-screen.tsx"));
    expect(chat).toContain('<div aria-hidden className="chat-pattern" />');
    expect(chat).toContain('className="relative isolate flex min-h-0 flex-1 bg-chat-canvas"');
  });

  it("uses artwork files that exist", () => {
    for (const token of [
      "--pattern-sidebar",
      "--pattern-canvas",
      "--hero-art-lineup",
      "--hero-art-spray",
      "--hero-art-bomb",
      "--hero-art-bar",
      "--hero-art-tub",
    ]) {
      const path = /url\("([^"]+)"\)/.exec(ROOT.get(token) ?? "")?.[1];
      expect(path, token).toBeTruthy();
      expect(statSync(join(process.cwd(), "public", path!)).size, path).toBeGreaterThan(1000);
    }
  });
});

