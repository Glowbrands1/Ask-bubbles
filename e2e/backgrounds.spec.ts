import { expect, test, type Locator, type Page } from "@playwright/test";

import { openNav, signInAsDemo } from "./support";

/**
 * ============================================================================
 * THE BRAND BACKGROUNDS stay decoration.
 * ============================================================================
 *
 * The approved "edge-weighted" option draws official Buff City Soap product
 * drawings behind the sidebar, the page canvas and the Home band. These checks
 * hold the rules the approval set, in a real browser at both widths:
 *
 *   - hidden from assistive technology and never in the way of a click
 *   - the approved opacities
 *   - no canvas pattern on chat or on phones
 *   - the Home line-up never overlaps the greeting, the ask bar or a chip
 */

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "element is rendered").not.toBeNull();
  return b!;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function canvasStyle(page: Page) {
  return page.locator(".canvas-pattern").evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, opacity: s.opacity, pointer: s.pointerEvents };
  });
}

test.describe("brand backgrounds", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsDemo(page, "location_manager");
  });

  test("the canvas pattern follows the route and stays out of the way", async ({ page, isMobile }) => {
    const layer = page.locator(".canvas-pattern");

    await page.goto("/");
    await expect(layer).toHaveAttribute("aria-hidden", "true");
    await expect(layer).toHaveAttribute("data-backdrop", "home");
    let style = await canvasStyle(page);
    expect(style.pointer).toBe("none");
    if (isMobile) {
      expect(style.display, "phones keep a plain canvas").toBe("none");
    } else {
      expect(style.opacity).toBe("0.12");
    }

    await page.goto("/history");
    await expect(layer).toHaveAttribute("data-backdrop", "work");
    style = await canvasStyle(page);
    if (!isMobile) expect(style.opacity).toBe("0.1");

    await page.goto("/chat");
    await expect(layer).toHaveAttribute("data-backdrop", "none");
    style = await canvasStyle(page);
    expect(style.display, "chat keeps a plain canvas").toBe("none");
  });

  test("the sidebar pattern is faint and keeps the logo clear", async ({ page }) => {
    await page.goto("/");
    const nav = await openNav(page);
    const rail = nav.locator("xpath=ancestor::div[contains(@class,'rail-pattern')]").first();
    const before = await rail.evaluate((el) => {
      const s = getComputedStyle(el, "::before");
      return { opacity: s.opacity, pointer: s.pointerEvents, mask: s.maskImage || s.webkitMaskImage };
    });
    expect(before.opacity).toBe("0.065");
    expect(before.pointer).toBe("none");
    // Faded out under the logo, and above the collapse button and user chip.
    // The browser reports `transparent` as rgba(0, 0, 0, 0).
    expect(before.mask).toContain("rgba(0, 0, 0, 0) 96px");
    expect(before.mask).toContain("rgba(0, 0, 0, 0) calc(100% - 140px)");
  });

  test("the Home line-up never sits behind text, the ask bar or a chip", async ({ page }) => {
    await page.goto("/");
    const art = page.locator(".band-art");
    await expect(art).toHaveAttribute("aria-hidden", "true");
    expect(await art.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.34");
    const artBox = await box(art);
    expect(artBox.width).toBeGreaterThan(100);

    const band = page.locator(".band-art-host");
    const things = [
      band.getByRole("heading", { level: 1 }),
      band.getByRole("textbox", { name: "Ask Bubbles a question" }),
      ...(await band.getByRole("button").filter({ visible: true }).all()),
      ...(await band.locator("p").filter({ visible: true }).all()),
    ];
    for (const thing of things) {
      const b = await box(thing);
      expect(overlaps(artBox, b), `line-up overlaps ${await thing.textContent()}`).toBe(false);
    }
  });
});

/*
 * STRICT PICTURES OF THE DECORATION ITSELF. The page baselines in
 * visual.spec.ts use Playwright's default per-pixel threshold, which a
 * 6.5–12% pattern sits under, so they cannot tell whether it is there. These
 * compare only decoration (text and controls masked out) at a much tighter
 * threshold, so losing or doubling a layer fails.
 */
test.describe("brand backgrounds, pictured", () => {
  // Pattern lines cover only ~1% of a region, so the allowance must be far
  // below that: 0.1% of pixels, after masking every word and control.
  const STRICT = { threshold: 0.02, maxDiffPixelRatio: 0.001, animations: "disabled" as const };

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-03-18T10:30:00-05:00"));
    await signInAsDemo(page, "location_manager");
  });

  test("Home band line-up", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const band = page.locator(".band-art-host");
    await expect(band).toHaveScreenshot("band-lineup.png", {
      ...STRICT,
      mask: [band.locator("h1, p, button, textarea, a, span, svg, img")],
    });
  });

  test("sidebar pattern", async ({ page }) => {
    await page.goto("/");
    const nav = await openNav(page);
    const rail = nav.locator("xpath=ancestor::div[contains(@class,'rail-pattern')]").first();
    await expect(rail).toHaveScreenshot("sidebar-pattern.png", {
      ...STRICT,
      mask: [rail.locator("a, button, p, span, img, svg, [role='separator']")],
    });
  });

  test("work-screen canvas", async ({ page, isMobile }) => {
    test.skip(isMobile, "phones keep a plain canvas; asserted in the test above");
    await page.goto("/forms/monitoring");
    await page.evaluate(() => document.fonts.ready);
    const view = page.viewportSize()!;
    // An empty stretch of canvas toward the bottom-right, below the page content.
    await expect(page).toHaveScreenshot("canvas-pattern.png", {
      ...STRICT,
      clip: { x: view.width - 640, y: view.height - 360, width: 600, height: 320 },
    });
  });
});
