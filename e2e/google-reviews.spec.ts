import { expect, test } from "@playwright/test";

import { signInAsDemo } from "./support";

/**
 * GOOGLE REVIEWS: layout only, nothing connected. Every data area says
 * "Not connected yet", no review figure appears, no Google request is made,
 * and the page never scrolls sideways.
 */
const TABS = [
  ["overview", "Overview"],
  ["reviews", "Google Reviews"],
  ["leaderboard", "Store Leaderboard"],
] as const;

test("Google Reviews renders three views, all not connected, with no overflow", async ({
  page,
}, info) => {
  const googleRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (
      /google|apify|\/api\/(admin\/)?google-reviews|\/api\/reviews/i.test(
        request.url(),
      )
    ) {
      googleRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await signInAsDemo(page, "owner");

  for (const [key, label] of TABS) {
    await page.goto(key === "overview" ? "/reviews" : `/reviews?tab=${key}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Google Reviews",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Google Reviews views" })
        .getByRole("link", { name: label }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("not-connected").first()).toHaveText(
      "Not connected yet",
    );

    const body = (await page.locator("main#main").innerText()) ?? "";
    expect(body).not.toMatch(/\d+\s*%|\d+\s*\/\s*\d+/);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${key} overflows horizontally`).toBeLessThanOrEqual(0);

    await page.screenshot({
      path: `test-results/google-reviews/${info.project.name}-${key}.png`,
      fullPage: true,
    });
  }

  expect(errors).toEqual([]);
  expect(googleRequests).toEqual([]);
});
