// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { OWNER_COLORS, ownerColor } from "@/features/l10/lib/bloom";
import type { MeetingDoc } from "@/features/l10/lib/types";
import { Scorecard } from "./Scorecard";

// The owner's feedback on the DM L10 scorecard (15 Nov 2026), as in the Leadership Hub (#98). Invented names only.
const row = (id: string, metric: string, owner: string, weeks: (number | null)[]) => ({ id, metric, owner, goal: "≥ 5", goalValue: 5, higherIsBetter: true, format: "number", weeks });
const start = () =>
  ({
    weekEndings: ["11/01/2026", "11/08/2026", "11/15/2026"],
    scorecard: [row("s1", "Sales calls", "Avery Quill", [4, 6, null]), row("s2", "Reviews", "Bo Lark", [7, 2, 5]), row("s3", "Visits", "Avery Quill", [5, 5, 9])],
  }) as unknown as MeetingDoc;

const saved: MeetingDoc[] = [];
function Harness() {
  const [doc, setDoc] = useState(start);
  const edit = (fn: (d: MeetingDoc) => MeetingDoc) =>
    setDoc((d) => {
      const next = fn(d);
      saved.push(next);
      return next;
    });
  return <Scorecard doc={doc} edit={edit} people={["Avery Quill", "Bo Lark"]} bloom today="2026-11-12" />;
}

afterEach(() => {
  cleanup();
  saved.length = 0;
});

describe("Bloom-style scorecard (the owner's feedback)", () => {
  // Changed on purpose 17 Nov 2026: the form was always open at the top (15 Nov). After the first meeting the team asked
  // for a button next to "Add week" that opens it (the test below).
  it('"Add metric" opens the form above the table, and saves a row with name, owner, goal, unit and direction', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add metric", expanded: false }));
    const form = screen.getByTestId("add-metric");
    expect(form.compareDocumentPosition(screen.getByTestId("bloom-scorecard")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const f = within(form);
    fireEvent.change(f.getByLabelText("Metric name"), { target: { value: "Callbacks" } });
    fireEvent.change(f.getByLabelText("Metric owner"), { target: { value: "Bo Lark" } });
    fireEvent.change(f.getByLabelText("Goal"), { target: { value: "≤ 3" } });
    fireEvent.change(f.getByLabelText("Format"), { target: { value: "number" } });
    fireEvent.change(f.getByLabelText("Direction"), { target: { value: "lower" } });
    fireEvent.click(f.getByRole("button", { name: "Add metric" }));
    expect(saved.at(-1)!.scorecard.at(-1)).toMatchObject({ metric: "Callbacks", owner: "Bo Lark", goal: "≤ 3", goalValue: 3, format: "number", higherIsBetter: false, weeks: [null, null, null] });
  });

  it('"Can we make the add metric a tab like the add week that then expands when you need to add something, right now it gets a bit confusing." (Marissa, 17 Nov 2026)', () => {
    render(<Harness />);
    // Closed at first: a button next to "Add week", no form.
    expect(screen.queryByTestId("add-metric")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Add metric", expanded: false });
    expect(toggle.parentElement).toBe(screen.getByRole("button", { name: /Add week/ }).parentElement);
    // It expands, and closes again (the toggle or Done).
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Add metric", expanded: true })).toBe(toggle);
    expect(screen.getByTestId("add-metric")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("add-metric")).getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("add-metric")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it('"make \'add week\' button visible" (the owner, 17 Nov 2026): Add week comes first, a filled button, and adds a week', () => {
    render(<Harness />);
    const toolbar = screen.getByTestId("scorecard-toolbar");
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons[0].textContent).toBe("+ Add week");
    // The page's filled (primary) button style, not the outline one Add metric uses.
    expect(buttons[0].className).not.toBe(within(toolbar).getByRole("button", { name: "Add metric" }).className);
    fireEvent.click(buttons[0]);
    expect(saved.at(-1)!.weekEndings).toHaveLength(4);
  });

  it('"expand this metric coz there is a space on the left side … collapsable maybe?" (the owner, 17 Nov 2026): Full width / Collapse', () => {
    function Wide() {
      const [wide, setWide] = useState(false);
      return (
        <>
          <span data-testid="wide">{String(wide)}</span>
          <Scorecard doc={start()} edit={() => {}} people={["Avery Quill"]} bloom today="2026-11-12" wide={wide} onWide={setWide} />
        </>
      );
    }
    render(<Wide />);
    fireEvent.click(screen.getByRole("button", { name: "⤢ Full width", pressed: false }));
    expect(screen.getByTestId("wide").textContent).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "⤡ Collapse", pressed: true }));
    expect(screen.getByTestId("wide").textContent).toBe("false");
  });

  it('"the numbers hurt my eyes" (the owner, 17 Nov 2026): figures in the page font, medium weight, lined up, not bold monospace', () => {
    render(<Harness />);
    const cell = within(screen.getByTestId("bloom-scorecard")).getAllByRole("button", { name: /^Reviews .+: \d/ })[0];
    expect(cell.className).toContain("font-sans");
    expect(cell.className).toContain("tabular-nums");
    expect(cell.className).not.toMatch(/font-mono|font-semibold|font-bold/);
  });

  it("week headers show the range on two lines, start over end, newest first", () => {
    render(<Harness />);
    const weeks = within(screen.getByTestId("bloom-scorecard")).getAllByRole("columnheader").slice(3);
    expect(weeks.map((h) => [h.querySelector("[data-week-start]")?.textContent, h.querySelector("[data-week-end]")?.textContent])).toEqual([
      ["9 Nov", "15 Nov"],
      ["2 Nov", "8 Nov"],
      ["26 Oct", "1 Nov"],
    ]);
    expect(weeks[0].textContent).toBe("9 Nov / 15 Nov"); // screen readers still hear the range
  });

  it("the current week's column is marked in its header and in every cell, not just the header", () => {
    render(<Harness />);
    const table = screen.getByTestId("bloom-scorecard");
    const heads = within(table).getAllByRole("columnheader");
    const col = heads.findIndex((h) => h.hasAttribute("data-current-week"));
    expect(heads[col].textContent).toBe("9 Nov / 15 Nov");
    // The group divider rows (19 Nov 2026) are one heading cell across the table; the metric rows are checked.
    for (const r of within(table).getAllByRole("row").slice(1).filter((x) => !x.hasAttribute("data-group-row"))) {
      const cells = within(r).getAllByRole("cell");
      expect(cells[col].hasAttribute("data-current-week")).toBe(true);
      expect(cells.filter((c) => c.hasAttribute("data-current-week"))).toHaveLength(1);
    }
  });

  it("the same owner always gets the same colour, on every row", () => {
    render(<Harness />);
    const avery = within(screen.getByTestId("bloom-scorecard")).getAllByTitle("Avery Quill").map((a) => a.getAttribute("data-owner-color"));
    expect(new Set(avery)).toEqual(new Set([String(ownerColor("Avery Quill"))]));
    expect(ownerColor("Avery Quill")).toBe(ownerColor("  avery   QUILL "));
    const names = ["Avery Quill", "Bo Lark", "Cy Marlow", "Dee Wren", "Eli Sorrel", "Fay Linden", "Gus Hollow", "Hal Brook"];
    expect(new Set(names.map(ownerColor)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("Scorecard accents in Ask Bubbles' teal (inside .hub-l10)", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const at = css.indexOf("THE SCORECARD'S ACCENTS");
  const section = css.slice(at, css.indexOf("/* ── Glass utilities", at));
  const hex = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "i"))![1];
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("declares --week-current and all six owner colours inside .hub-l10 from Ask Bubbles' tokens, with no new colour values", () => {
    expect(at).toBeGreaterThan(-1);
    expect(section).toMatch(/\.hub-l10 \{\s*--week-current: var\(--bcs-tokyo-tint\);/);
    for (let n = 1; n <= OWNER_COLORS; n++) {
      expect(section).toMatch(new RegExp(`--owner-${n}-bg: [^;]*var\\(--`));
      expect(section).toMatch(new RegExp(`\\.hub-l10 \\[data-owner-color="${n}"\\] \\{ background-color: var\\(--owner-${n}-bg\\)`));
    }
    expect(section.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });

  it("keeps the initials and the current week's text at 4.5:1 or more", () => {
    // Ask Bubbles: its own --bcs-* tokens (the QA-approved plan, 15 Nov 2026) instead of the sibling's yellow mixes.
    const t = (name: string) => hex(`bcs-${name}`);
    const ink = "#0a0a0a";
    const pairs: [string, string][] = [
      [t("tokyo-active"), t("tokyo-tint")],
      [t("charcoal"), t("tokyo-mist")],
      [t("charcoal"), t("magnolia")],
      [t("tokyo-active"), t("info-tint")],
      [t("warn-ink"), t("warn-tint")],
      [t("attention"), t("attention-tint")],
      [ink, t("tokyo-tint")], // a figure in the current week's column
      [t("charcoal"), t("tokyo-mist")], // the current week's header
    ];
    for (const [fg, bg] of pairs) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("GM L10 scorecard: a divider around each store (QA, 19 Nov 2026, port from Ask Sunny)", () => {
  // "Is there also a way we can create some distinction around each salon, maybe a divider? It will make it easier to
  // view-- and we will want that on bubbles too." On the GM L10 each store owns its metrics. Invented store names.
  it("each store's metrics start with a divider row naming the store", () => {
    const doc = {
      weekEndings: ["11/01/2026", "11/08/2026"],
      scorecard: [row("a1", "N - AOV PTD", "Store North", [null, null]), row("a2", "N - Store Fullness %", "Store North", [null, null]), row("b1", "S - AOV PTD", "Store South", [null, null])],
    } as unknown as MeetingDoc;
    render(<Scorecard doc={doc} edit={() => {}} people={["Store North", "Store South"]} bloom today="2026-11-05" />);
    const table = screen.getByTestId("bloom-scorecard");
    expect([...table.querySelectorAll("[data-group-row]")].map((r) => r.textContent)).toEqual(["Store North", "Store South"]);
    const north = within(screen.getByRole("rowgroup", { name: "Store North's metrics" })).getAllByRole("row");
    expect(north[0].hasAttribute("data-group-row")).toBe(true);
    expect(north).toHaveLength(3);
  });
});
