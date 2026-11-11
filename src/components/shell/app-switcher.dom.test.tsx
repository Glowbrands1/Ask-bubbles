// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppSwitcher } from "./app-switcher";

/**
 * The switcher is a link to the other app's production URL and nothing more:
 * the current app is marked, the other one is a plain anchor, and no session
 * or token travels with it.
 */

afterEach(cleanup);

async function open(props: React.ComponentProps<typeof AppSwitcher> = {}) {
  render(<AppSwitcher {...props} />);
  await userEvent.click(screen.getByRole("button", { name: /switch app/i }));
}

describe("the app switcher", () => {
  it("lists the three apps with their companies", async () => {
    await open();
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("Ask Sunny")).toBeTruthy();
    expect(menu.getByText("Sun Tan City")).toBeTruthy();
    expect(menu.getByText("Ask Bubbles")).toBeTruthy();
    expect(menu.getByText("Buff City Soap")).toBeTruthy();
  });

  it("marks Ask Bubbles as the current app and does not link it", async () => {
    await open();
    const current = screen.getByRole("menuitem", { current: true });
    expect(current.textContent).toContain("Ask Bubbles");
    expect(current.getAttribute("href")).toBeNull();
  });

  it("sends Ask Sunny to its production URL, with nothing appended", async () => {
    await open();
    const other = screen.getByRole("menuitem", { name: /Ask Sunny/ });
    expect(other.tagName).toBe("A");
    expect(other.getAttribute("href")).toBe("https://ask-sunny.vercel.app");
    expect(other.getAttribute("aria-current")).toBeNull();
  });

  it("renders three tabs, Ask Bubbles current and the other two as links", async () => {
    await open({ showLeadershipHub: true });
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    const hub = screen.getByRole("menuitem", { name: /Leadership Hub/ });
    expect(hub.tagName).toBe("A");
    expect(hub.getAttribute("href")).toBe("https://leadership-hub-beta.vercel.app");
  });

  it("hides the Leadership Hub tab unless the server said yes", async () => {
    await open();
    expect(screen.queryByRole("menuitem", { name: /Leadership Hub/ })).toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("labels the trigger for assistive technology", () => {
    render(<AppSwitcher />);
    expect(screen.getByRole("button", { name: "Switch app — current: Ask Bubbles" })).toBeTruthy();
  });
});
