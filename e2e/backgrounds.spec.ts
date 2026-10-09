import { expect, test, type Locator, type Page } from "@playwright/test";

import { openNav, signInAsDemo } from "./support";

/**
 * ============================================================================
 * THE BRAND BACKGROUNDS stay decoration.
 * ============================================================================
 *
 * The approved "edge-weighted" option, made stronger on 9 Oct 2026, draws
 * official Buff City Soap product drawings behind the sidebar, the page
 * canvas, the chat canvas and the Home band. These checks hold the rules the
 * approvals set, in a real browser at both widths:
 *
 *   - hidden from assistive technology and never in the way of a click
 *   - the approved opacities
 *   - the page canvas stays plain on phones; chat has its own patterned canvas
 *   - the Home drawings sit behind the band's content, never over it
 */

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "element is rendered").not.toBeNull();
  return b!;
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
      expect(style.opacity).toBe("0.22");
    }

    // The band pages carry the chat canvas: the whole page, phones included.
    await page.goto("/history");
    await expect(layer).toHaveAttribute("data-backdrop", "band");
    style = await canvasStyle(page);
    expect(style).toEqual({ display: "block", opacity: "0.22", pointer: "none" });

    // Chat draws its own pattern over the soft-tint canvas instead.
    await page.goto("/chat");
    await expect(layer).toHaveAttribute("data-backdrop", "none");
    style = await canvasStyle(page);
    expect(style.display, "the page canvas steps aside on chat").toBe("none");
    const chat = page.locator(".chat-pattern");
    await expect(chat).toHaveAttribute("aria-hidden", "true");
    const chatStyle = await chat.evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, opacity: s.opacity, pointer: s.pointerEvents };
    });
    expect(chatStyle).toEqual({ display: "block", opacity: "0.22", pointer: "none" });
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

  test("the Home drawings sit behind the band's content and take no clicks", async ({ page, isMobile }) => {
    await page.goto("/");
    const art = page.locator(".hero-art");
    await expect(art).toHaveAttribute("aria-hidden", "true");
    expect(await art.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    expect(await art.evaluate((el) => getComputedStyle(el).zIndex)).toBe("-1");
    const lineup = page.locator(".hero-art-lineup");
    const lineupBox = await box(lineup);
    expect(lineupBox.width, "the line-up is drawn large").toBeGreaterThan(isMobile ? 200 : 400);

    // Everything in the band is still the thing under the pointer.
    const band = page.locator("section[aria-label='Ask Bubbles']");
    const things = [
      band.getByRole("heading", { level: 1 }),
      band.getByRole("textbox", { name: "Ask Bubbles a question" }),
      ...(await band.getByRole("button").filter({ visible: true }).all()),
    ];
    for (const thing of things) {
      const b = await box(thing);
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest(".hero-art") !== null,
        [b.x + b.width / 2, b.y + b.height / 2],
      );
      expect(hit, `a drawing is over ${await thing.textContent()}`).toBe(false);
    }
  });

  test("the Buff City Soap logo is White, in the band on desktop and the top bar on phones", async ({ page, isMobile }) => {
    for (const path of ["/", "/chat"]) {
      await page.goto(path);
      const logo = page.getByRole("img", { name: "Buff City Soap" }).filter({ visible: true });
      await expect(logo).toHaveCount(1);
      await expect(logo).toHaveAttribute("src", /bcs-logo-stacked-white/);
      const b = await box(logo);
      if (isMobile) {
        expect(b.height).toBeCloseTo(40, 0);
      } else {
        expect(b.height).toBeGreaterThanOrEqual(56);
        // No shell bar above the band on desktop.
        await expect(page.locator("header.sticky").filter({ visible: true })).toHaveCount(0);
      }
    }
  });

});

test.describe("band pages", () => {
  // The owner may open every band page, the admin-only Analytics included.
  test.beforeEach(async ({ page }) => {
    await signInAsDemo(page, "owner");
  });

  for (const path of ["/history", "/knowledge", "/forms/monitoring", "/forms/templates", "/reports", "/admin/analytics"]) {
    test(`${path} opens with the Tokyo Green header and the White logo`, async ({ page, isMobile }) => {
      await page.goto(path);
      const title = page.getByRole("heading", { level: 1 });
      await expect(title).toBeVisible();
      // The title sits on the band, in the lettering face.
      const band = title.locator("xpath=ancestor::*[contains(@class,'page-band')][1]");
      await expect(band).toHaveCount(1);
      expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/grandstander/i);

      const logo = page.getByRole("img", { name: "Buff City Soap" }).filter({ visible: true });
      await expect(logo).toHaveCount(1);
      await expect(logo).toHaveAttribute("src", /bcs-logo-stacked-white/);
      if (!isMobile) {
        await expect(page.locator("header.sticky").filter({ visible: true })).toHaveCount(0);
      }

      // Full width, but never a sideways scroll.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true);
    });
  }
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

  test("Home band drawings", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const band = page.locator("section[aria-label='Ask Bubbles'] > div").first();
    await expect(band).toHaveScreenshot("band-drawings.png", {
      ...STRICT,
      // Every child of the band except the drawings layer: text, the ask bar,
      // the chips and the logo are covered by the page baselines.
      mask: [band.locator(":scope > *:not(.hero-art)")],
    });
  });

  test("chat canvas", async ({ page, isMobile }) => {
    test.skip(isMobile, "the phone layout fills this area with starter prompts; asserted above");
    await page.goto("/chat");
    await page.evaluate(() => document.fonts.ready);
    const view = page.viewportSize()!;
    // An empty stretch of the canvas between the starter prompts and the composer.
    await expect(page).toHaveScreenshot("chat-canvas.png", {
      ...STRICT,
      clip: { x: view.width - 360, y: view.height - 480, width: 320, height: 240 },
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

  test("band-page canvas", async ({ page, isMobile }) => {
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
