// Ask Bubbles only (not copied from the Leadership Hub). See src/features/l10/PARITY.md.
import type { MeetingDoc, Todo } from "./types";

/*
 * To-do history (the owner, 17 Nov 2026: "to do - archive or delete and have a tab for history").
 *
 * Archived to-dos, and the done ones a new meeting used to drop, are kept in the meeting document as `todoHistory`,
 * newest first. The Hub keeps fields it does not know and does not show this one, so its own To-do list is unchanged.
 * Each entry is the to-do as it was plus `archivedAt` (ISO time). Capped so the document stays small.
 */
export const TODO_HISTORY_LIMIT = 300;

export type ArchivedTodo = Todo & { archivedAt: string };

export function todoHistory(doc: object): ArchivedTodo[] {
  const h = (doc as { todoHistory?: unknown }).todoHistory;
  return Array.isArray(h) ? (h.filter((t) => t && typeof t === "object" && typeof (t as Todo).id === "string" && typeof (t as Todo).text === "string") as ArchivedTodo[]) : [];
}

/** `todos` added to the front of the history (newest first), stamped now, capped. */
export function withHistory(doc: MeetingDoc, todos: Todo[], now: number): ArchivedTodo[] {
  const at = new Date(now).toISOString();
  return [...todos.map((t) => ({ ...t, archivedAt: at })), ...todoHistory(doc)].slice(0, TODO_HISTORY_LIMIT);
}

/** Moves the given to-dos from the list into the history. */
export function archiveTodos(doc: MeetingDoc, ids: ReadonlySet<string>, now: number): MeetingDoc {
  const moving = doc.todos.filter((t) => ids.has(t.id));
  if (moving.length === 0) return doc;
  return { ...doc, todos: doc.todos.filter((t) => !ids.has(t.id)), todoHistory: withHistory(doc, moving, now) };
}

/** Puts an archived to-do back on the list. */
export function restoreTodo(doc: MeetingDoc, id: string): MeetingDoc {
  const entry = todoHistory(doc).find((t) => t.id === id);
  if (!entry) return doc;
  const copy = { ...entry } as Record<string, unknown>;
  delete copy.archivedAt;
  return { ...doc, todos: [...doc.todos, copy as Todo], todoHistory: todoHistory(doc).filter((t) => t.id !== id) };
}

/** Deletes an archived to-do for good. */
export function deleteFromHistory(doc: MeetingDoc, id: string): MeetingDoc {
  return { ...doc, todoHistory: todoHistory(doc).filter((t) => t.id !== id) };
}
