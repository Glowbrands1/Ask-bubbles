// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AnalyticsUnavailable } from "./analytics-unavailable";

afterEach(cleanup);

describe("a deployment with no database", () => {
  it("says analytics needs the live database instead of failing the page", () => {
    render(<AnalyticsUnavailable reason="not_connected" />);
    expect(screen.getByText("Analytics needs the live database")).toBeTruthy();
    expect(screen.getByText(/Nothing here is estimated or sampled/)).toBeTruthy();
  });

  it("distinguishes a database that did not answer", () => {
    render(<AnalyticsUnavailable reason="failed" />);
    expect(screen.getByText("Analytics could not be loaded")).toBeTruthy();
  });

  it("is what every database-backed admin and forms page checks before reading", () => {
    // These pages read only from the database; each must check the connection
    // first rather than throwing a configuration error at the viewer.
    for (const page of [
      "src/app/(app)/admin/analytics/page.tsx",
      "src/app/(app)/admin/analytics/[view]/page.tsx",
      "src/app/(app)/forms/monitoring/page.tsx",
      "src/app/(app)/forms/templates/page.tsx",
      "src/app/(app)/forms/templates/[key]/page.tsx",
      "src/app/(app)/page.tsx",
    ]) {
      expect(readFileSync(page, "utf8"), page).toContain("supabaseSecretKeyConfigured()");
    }
  });
});
