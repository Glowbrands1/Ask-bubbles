"use client";
// Copied from the Leadership Hub (src/app/meetings/_components/Todos.tsx); keep in step with it. See src/features/l10/README.md.
// Ask Bubbles (Pau, 20 Nov 2026, port from the sibling app): a due date is set when adding and changed after, in both layouts.

import { useState } from "react";
import { Button, cx, inputClass } from "@/features/l10/ui/ui";
import { StatusBadge } from "@/features/l10/ui/StatusBadge";
import { MentionField, MentionText, useMentionPlain } from "@/features/l10/ui/Mentions";
import { newItemId, parseMention, sortTodos } from "@/features/l10/lib/doc";
import { todoState } from "@/features/l10/lib/dueStatus";
import type { Todo } from "@/features/l10/lib/types";
import type { ArchivedTodo } from "@/features/l10/lib/todoHistory";
import { mmddyyyy } from "@/features/l10/lib/bloom";
import { todoDueLabel, withTodoDueDate } from "@/features/l10/lib/todo-due";

const initials = (name: string) => name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/** Ask Bubbles: the to-do history (lib/todoHistory.ts) and its actions, for the Bloom-style page. */
export interface TodoHistoryProps {
  history: ArchivedTodo[];
  onArchive: (ids: string[]) => void;
  onRestore: (id: string) => void;
  onDeleteForGood: (id: string) => void;
}

export function Todos({ todos, onChange, people, today, bloom = false, history }: { todos: Todo[]; onChange: (next: Todo[]) => void; people: string[]; today: string; /** Laid out like Bloom Growth's To-dos (the DM L10s). */ bloom?: boolean; history?: TodoHistoryProps }) {
  if (bloom) return <BloomTodos todos={todos} onChange={onChange} people={people} today={today} history={history} />;
  return <ListTodos todos={todos} onChange={onChange} people={people} today={today} />;
}

function ListTodos({ todos, onChange, people, today }: { todos: Todo[]; onChange: (next: Todo[]) => void; people: string[]; today: string }) {
  const plain = useMentionPlain();
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [editingDue, setEditingDue] = useState<string | null>(null);
  const mention = parseMention(text, people);
  const ownerFinal = mention.owner ?? owner;

  const add = () => {
    const t = mention.text.trim();
    if (!t) return;
    onChange([...todos, withTodoDueDate({ id: newItemId(), text: t, owner: ownerFinal || "—", due: "Next wk", done: false }, due)]);
    setText("");
    setDue("");
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {sortTodos(todos, today).map((t) => {
          const state = todoState(t, today);
          return (
            <li key={t.id} className={cx("flex items-center gap-3 rounded-[10px] border p-3 shadow-card", state === "overdue" ? "border-[#8a1c1c]/50 bg-[#fbe4e4]/50" : state === "soon" ? "border-[#8a4a00]/40 bg-[#fdebd0]/40" : "border-line bg-white")}>
              <input type="checkbox" aria-label={`Done: ${plain(t.text)}`} checked={t.done} onChange={() => onChange(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} className="size-[18px] accent-bronze" />
              <span className="flex size-7 flex-none items-center justify-center rounded-full bg-cream text-[10px] font-bold">{initials(t.owner)}</span>
              <span className={cx("flex-1 text-sm", t.done && "text-muted line-through")}>
                <MentionText text={t.text} />
                {!t.done && (t.carryCount ?? 0) > 0 && <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">carried {t.carryCount}w</span>}
                {t.escalated && <span className="ml-2 rounded-full border border-[#8a1c1c]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#8a1c1c]">moved to issues</span>}
              </span>
              <span className="hidden rounded-full bg-cream px-2.5 py-0.5 text-xs sm:inline">{t.owner}</span>
              {state !== "none" && <StatusBadge state={state} />}
              {/* Pau, 20 Nov 2026: the date reads "Due Fri, Nov 27" and can be changed, or cleared back to "Next wk", after adding. */}
              {editingDue === t.id ? (
                <input
                  aria-label={`Due date: ${plain(t.text)}`}
                  type="date"
                  autoFocus
                  value={t.dueDate ?? ""}
                  onChange={(e) => onChange(todos.map((x) => (x.id === t.id ? withTodoDueDate(x, e.target.value) : x)))}
                  onBlur={() => setEditingDue(null)}
                  className={cx(inputClass, "w-40 text-xs")}
                />
              ) : (
                <button type="button" aria-label={`Change due date: ${plain(t.text)}`} onClick={() => setEditingDue(t.id)} className={cx("text-xs underline-offset-2 hover:underline", state === "overdue" ? "font-bold text-[#7a1717]" : "text-muted")}>
                  {todoDueLabel(t)}
                </button>
              )}
              <button type="button" aria-label={`Delete to-do ${plain(t.text)}`} className="text-xs text-muted hover:text-[#8a1c1c]" onClick={() => onChange(todos.filter((x) => x.id !== t.id))}>
                ✕
              </button>
            </li>
          );
        })}
        {todos.length === 0 && <li className="rounded-[10px] border border-dashed border-line p-4 text-sm text-muted">No to-dos yet.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line bg-cream/60 p-3">
        <MentionField aria-label="New to-do" value={text} onChange={setText} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New to-do… try @ and a name" className="min-w-[220px] flex-1" />
        <select aria-label="To-do owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={cx(inputClass, "w-48")}>
          <option value="">Owner (optional)</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input aria-label="To-do due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cx(inputClass, "w-40")} />
        <Button variant="primary" disabled={!mention.text.trim()} onClick={add}>
          Add to-do
        </Button>
        {mention.owner && <span className="text-xs text-muted">Assigned to {mention.owner}</span>}
      </div>
    </div>
  );
}

/**
 * To-dos as Bloom Growth lays them out (the DM L10s; the owner's request, 15 Nov 2026): "X% Completed", an
 * "Owner: A–Z" sort and a quick-add row (owner, the to-do, Enter) on top; each row has a round check, the owner's
 * initials (full name on hover), a chevron for the details, the text and the due date on the right as MM-DD-YYYY.
 */
function BloomTodos({ todos, onChange, people, today, history }: { todos: Todo[]; onChange: (next: Todo[]) => void; people: string[]; today: string; history?: TodoHistoryProps }) {
  // Ask Bubbles: Open / History tabs (the owner, 17 Nov 2026: "to do - archive or delete and have a tab for history").
  const [tab, setTab] = useState<"open" | "history">("open");
  const plain = useMentionPlain();
  const [text, setText] = useState("");
  const [owner, setOwner] = useState(people[0] ?? "");
  // Ask Bubbles: a due date when adding, and in each to-do's details (the owner, 17 Nov 2026: "to do, can we set a date").
  const [due, setDue] = useState("");
  const [ownerAz, setOwnerAz] = useState(false);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const mention = parseMention(text, people);
  const done = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
  const sorted = sortTodos(todos, today);
  const shown = ownerAz ? [...sorted].sort((a, b) => a.owner.localeCompare(b.owner)) : sorted;
  const add = () => {
    const t = mention.text.trim();
    if (!t) return;
    onChange([...todos, withTodoDueDate({ id: newItemId(), text: t, owner: (mention.owner ?? owner) || "—", due: "Next wk", done: false }, due)]);
    setText("");
    setDue("");
  };
  const setDueDate = (id: string, value: string) => onChange(todos.map((x) => (x.id === id ? withTodoDueDate(x, value) : x)));
  const toggleOpen = (id: string) =>
    setOpenIds((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const doneIds = todos.filter((t) => t.done).map((t) => t.id);
  return (
    <div className="flex flex-col gap-3" data-testid="bloom-todos">
      {history && (
        <div role="tablist" aria-label="To-do lists" className="flex flex-wrap gap-1 border-b border-line print:hidden">
          {(["open", "history"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx("-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold", tab === k ? "border-bronze text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {k === "open" ? `To-dos (${todos.length})` : `History (${history.history.length})`}
            </button>
          ))}
        </div>
      )}
      {history && tab === "history" ? (
        <TodoHistoryList history={history} />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 flex-1 text-sm font-bold" data-testid="todos-completed">
          {pct}% Completed
        </p>
        {history && doneIds.length > 0 && (
          <Button variant="outline" onClick={() => history.onArchive(doneIds)} className="print:hidden" title="Move every done to-do to History">
            Archive done ({doneIds.length})
          </Button>
        )}
        <Button variant="outline" aria-pressed={ownerAz} onClick={() => setOwnerAz((v) => !v)} className="print:hidden">
          Owner: A–Z
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line bg-cream/60 p-2 print:hidden">
        <select aria-label="To-do owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={cx(inputClass, "w-44")}>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <MentionField aria-label="New to-do" value={text} onChange={setText} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New To-do… press Enter to add" wrapperClassName="min-w-[220px] flex-1" />
        <input type="date" aria-label="To-do due date" title="Due date (optional)" value={due} onChange={(e) => setDue(e.target.value)} className={cx(inputClass, "w-40")} />
        <Button variant="primary" disabled={!mention.text.trim()} onClick={add}>
          Add
        </Button>
      </div>
      <ul aria-label="To-dos" className="m-0 flex list-none flex-col overflow-hidden rounded-[10px] border border-line bg-white p-0 shadow-card">
        {shown.map((t) => {
          const state = todoState(t, today);
          const open = openIds.has(t.id);
          const dueText = t.dueDate ? mmddyyyy(t.dueDate) : (t.due ?? "");
          return (
            <li key={t.id} className="border-t border-rule first:border-t-0">
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={`Done: ${plain(t.text)}`}
                  onClick={() => onChange(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                  className={cx("flex size-5 flex-none items-center justify-center rounded-full border-2 text-[11px] font-bold", t.done ? "border-[#2f8a43] bg-[#2f8a43] text-white" : "border-line bg-white hover:border-bronze")}
                >
                  {t.done ? "✓" : ""}
                </button>
                <span title={t.owner} className="flex size-7 flex-none items-center justify-center rounded-full bg-cream text-[10px] font-bold">
                  <span aria-hidden>{initials(t.owner)}</span>
                  <span className="sr-only">{t.owner}</span>
                </span>
                <button type="button" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} details: ${plain(t.text)}`} onClick={() => toggleOpen(t.id)} className="inline-flex size-7 flex-none items-center justify-center rounded text-muted hover:bg-cream hover:text-ink">
                  <span aria-hidden className={cx("text-[10px] transition-transform", open && "rotate-90")}>
                    ▶
                  </span>
                </button>
                <span className={cx("min-w-0 flex-1 text-sm", t.done && "text-muted line-through")}>
                  <MentionText text={t.text} />
                </span>
                {state !== "none" && <StatusBadge state={state} />}
                <span data-testid="todo-due" className={cx("flex-none text-xs tabular-nums", state === "overdue" && !t.done ? "font-bold text-[#7a1717]" : "text-muted")}>
                  {dueText}
                </span>
              </div>
              {open && (
                <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5 pl-[4.75rem] text-xs text-muted">
                  <span>Owner: {t.owner}</span>
                  <label className="flex items-center gap-1.5">
                    Due
                    <input type="date" aria-label={`Due date: ${plain(t.text)}`} value={t.dueDate ?? ""} onChange={(e) => setDueDate(t.id, e.target.value)} className={cx(inputClass, "min-h-9 w-40 text-xs")} />
                  </label>
                  {!t.done && (t.carryCount ?? 0) > 0 && <span className="rounded-full border border-line px-1.5 py-0.5">carried {t.carryCount}w</span>}
                  {t.escalated && <span className="rounded-full border border-[#8a1c1c]/40 px-1.5 py-0.5 font-bold text-[#8a1c1c]">moved to issues</span>}
                  <span className="ml-auto flex items-center gap-3">
                    {history && (
                      <button type="button" aria-label={`Archive to-do ${plain(t.text)}`} className="min-h-9 font-semibold text-bronze-deep hover:underline" onClick={() => history.onArchive([t.id])}>
                        Archive
                      </button>
                    )}
                    <button type="button" aria-label={`Delete to-do ${plain(t.text)}`} className="min-h-9 text-muted hover:text-[#8a1c1c]" onClick={() => onChange(todos.filter((x) => x.id !== t.id))}>
                      Delete
                    </button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
        {todos.length === 0 && <li className="p-4 text-sm text-muted">No to-dos yet.</li>}
      </ul>
      </>
      )}
    </div>
  );
}

/** The History tab: archived to-dos and the done ones from past meetings, newest first; Restore or Delete for good. */
function TodoHistoryList({ history }: { history: TodoHistoryProps }) {
  const plain = useMentionPlain();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (history.history.length === 0) return <p className="m-0 rounded-[10px] border border-dashed border-line bg-white/70 p-4 text-sm text-muted">No to-dos in history yet. Archived to-dos, and done ones from past meetings, show here.</p>;
  return (
    <ul aria-label="To-do history" className="m-0 flex list-none flex-col overflow-hidden rounded-[10px] border border-line bg-white p-0 shadow-card">
      {history.history.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule px-3 py-2 first:border-t-0">
          <span aria-hidden className={cx("flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-bold", t.done ? "bg-[#2f8a43] text-white" : "border-2 border-line bg-white")}>
            {t.done ? "✓" : ""}
          </span>
          <span title={t.owner} className="flex size-7 flex-none items-center justify-center rounded-full bg-cream text-[10px] font-bold">
            <span aria-hidden>{initials(t.owner)}</span>
            <span className="sr-only">{t.owner}</span>
          </span>
          <span className={cx("min-w-0 flex-1 text-sm", t.done && "text-muted line-through")}>
            <MentionText text={t.text} />
          </span>
          <span className="text-xs text-muted tabular-nums">{t.done ? "Done" : "Not done"} · archived {mmddyyyy(t.archivedAt)}</span>
          {confirmId === t.id ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#8a1c1c]">Delete for good?</span>
              <Button variant="outline" className="text-[#8a1c1c]" aria-label={`Yes, delete ${plain(t.text)}`} onClick={() => (history.onDeleteForGood(t.id), setConfirmId(null))}>
                Yes, delete
              </Button>
              <Button variant="outline" onClick={() => setConfirmId(null)}>
                Keep
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-3 text-xs">
              <button type="button" aria-label={`Restore ${plain(t.text)}`} className="min-h-9 font-semibold text-bronze-deep hover:underline" onClick={() => history.onRestore(t.id)}>
                Restore
              </button>
              <button type="button" aria-label={`Delete for good ${plain(t.text)}`} className="min-h-9 text-muted hover:text-[#8a1c1c]" onClick={() => setConfirmId(t.id)}>
                Delete
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
