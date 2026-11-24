// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Todo } from "@/features/l10/lib/types";
import { Todos } from "./Todos";

/*
 * Port from the sibling app (Pau, 20 Nov 2026: "pls help add due date for both sunny and bubble"). A user there could not
 * give their L10 To-Dos a due date: "It simply states 'Next wk'." This app's Bloom layout already took a date (the owner,
 * 17 Nov 2026); the list layout could never change one after adding. Invented names only.
 */
const PEOPLE = ["Pat Example", "Sam Sample"];
const TODOS: Todo[] = [
  { id: "t1", text: "Restock the soap shelf", owner: "Pat Example", due: "Next wk", done: false },
  { id: "t2", text: "Order gift bags", owner: "Sam Sample", due: "2026-11-27", dueDate: "2026-11-27", done: false },
];

afterEach(cleanup);

describe("To-dos: a due date when adding and editing", () => {
  it("DM L10 (Bloom layout): adding with a due date saves it", () => {
    const onChange = vi.fn();
    render(<Todos bloom todos={[]} onChange={onChange} people={PEOPLE} today="2026-11-20" />);
    fireEvent.change(screen.getByLabelText("New to-do"), { target: { value: "Send the schedule" } });
    fireEvent.change(screen.getByLabelText("To-do due date"), { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ text: "Send the schedule", dueDate: "2026-11-27", done: false });
  });

  it("DM L10 (Bloom layout): no date keeps \"Next wk\", the details change the date, and clearing drops it", () => {
    const onChange = vi.fn();
    render(<Todos bloom todos={TODOS} onChange={onChange} people={PEOPLE} today="2026-11-20" />);
    expect(screen.getAllByTestId("todo-due").map((cell) => cell.textContent)).toEqual(expect.arrayContaining(["Next wk", "11-27-2026"]));
    fireEvent.click(screen.getByRole("button", { name: "Show details: Restock the soap shelf" }));
    fireEvent.change(screen.getByLabelText("Due date: Restock the soap shelf"), { target: { value: "2026-12-02" } });
    const next = onChange.mock.calls.at(-1)![0] as Todo[];
    expect(next.find((todo) => todo.id === "t1")).toMatchObject({ dueDate: "2026-12-02" });
    expect(next.find((todo) => todo.id === "t2")).toEqual(TODOS[1]);
  });

  it("GM L10 (list layout): the date reads \"Due Fri, Nov 27\", can be changed, and cleared back to \"Next wk\"", () => {
    const onChange = vi.fn();
    render(<Todos todos={TODOS} onChange={onChange} people={PEOPLE} today="2026-11-20" />);
    expect(screen.getByRole("button", { name: "Change due date: Order gift bags" }).textContent).toBe("Due Fri, Nov 27");
    expect(screen.getByRole("button", { name: "Change due date: Restock the soap shelf" }).textContent).toBe("Next wk");
    fireEvent.click(screen.getByRole("button", { name: "Change due date: Restock the soap shelf" }));
    fireEvent.change(screen.getByLabelText("Due date: Restock the soap shelf"), { target: { value: "2026-12-04" } });
    expect((onChange.mock.calls.at(-1)![0] as Todo[]).find((todo) => todo.id === "t1")).toMatchObject({ dueDate: "2026-12-04" });
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Change due date: Order gift bags" }));
    fireEvent.change(screen.getByLabelText("Due date: Order gift bags"), { target: { value: "" } });
    const cleared = (onChange.mock.calls.at(-1)![0] as Todo[]).find((todo) => todo.id === "t2")!;
    expect(cleared.dueDate).toBeUndefined();
    expect(cleared.due).toBe("Next wk");
  });

  it("GM L10 (list layout): adding with a date saves it; without one keeps \"Next wk\"", () => {
    const onChange = vi.fn();
    render(<Todos todos={[]} onChange={onChange} people={PEOPLE} today="2026-11-20" />);
    fireEvent.change(screen.getByLabelText("New to-do"), { target: { value: "Check the bath bomb count" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to-do" }));
    const added = onChange.mock.calls[0][0][0] as Todo;
    expect(added.due).toBe("Next wk");
    expect("dueDate" in added).toBe(false);
    fireEvent.change(screen.getByLabelText("New to-do"), { target: { value: "Count the gift cards" } });
    fireEvent.change(screen.getByLabelText("To-do due date"), { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to-do" }));
    expect(onChange.mock.calls.at(-1)![0].at(-1)).toMatchObject({ text: "Count the gift cards", due: "2026-11-27", dueDate: "2026-11-27" });
  });
});
