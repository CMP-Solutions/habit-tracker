# ToDos Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone "ToDo" concept (one-off tasks with optional due date/time and priority) alongside the existing recurring-goal tracking, with full CRUD, a dashboard integration, and a unified "Neu +" creation menu.

**Architecture:** A new Dexie table (`todos`, requiring a real `db.version(2)` bump since it's a new object store) with its own storage module (`src/lib/storage/todos.ts`), independent of the Goal domain. A shared presentational `TodoRow` component renders a todo consistently on both the dashboard (a filtered "what's due now" subset) and the full `/todos` management page. Navigation's single "new" action becomes a small popover menu offering either creation flow.

**Tech Stack:** Next.js App Router, TypeScript, Dexie (IndexedDB), Tailwind, shadcn/ui (base-ui primitives), Vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-16-todos-phase-a-design.md`

## Global Constraints

- New Dexie table requires `db.version(2).stores({...})` — the four existing tables' definitions must be repeated unchanged in the new version block (Dexie diffs version blocks against each other; omitting an existing table drops it).
- A todo's `title` is the only required field; `dueDate`, `dueTime`, `priority` are all optional (`null` when unset).
- `dueTime` is only ever meaningful when `dueDate` is also set — the form disables the time field until a date is chosen, but the storage layer does not enforce this (permissive, consistent with how the rest of this codebase validates only true hard requirements).
- Dashboard shows open todos that are overdue, due today, or have no due date at all — never future-dated open todos (those only appear on `/todos`).
- A completed todo disappears immediately from whichever list is currently shown (no fade/delay).
- No new top-level nav item for ToDos — reachable only via the dashboard's "Alle anzeigen" link.

---

### Task 1: Schema — `todos` table + basic CRUD

**Files:**
- Modify: `src/lib/storage/db.ts`
- Create: `src/lib/storage/todos.ts`
- Test: `src/lib/storage/__tests__/todos.test.ts`

**Interfaces:**
- Produces: `TodoRecord { id: string; title: string; dueDate: string | null; dueTime: string | null; priority: "low" | "normal" | "high" | null; done: boolean; createdAt: string }`, `CreateTodoInput { title: string; dueDate?: string | null; dueTime?: string | null; priority?: "low" | "normal" | "high" | null }`, `createTodo(input: CreateTodoInput): Promise<TodoRecord>`, `getTodo(id: string): Promise<TodoRecord>` (throws `"Not found"` if missing), `updateTodo(id: string, patch: Partial<CreateTodoInput> & { done?: boolean }): Promise<TodoRecord>`, `deleteTodo(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/__tests__/todos.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createTodo, getTodo, updateTodo, deleteTodo } from "../todos";

describe("todos storage: CRUD", () => {
  beforeEach(async () => {
    await db.todos.clear();
  });

  it("creates a todo with only a title, defaulting everything else", async () => {
    const todo = await createTodo({ title: "Steuererklärung abschicken" });
    expect(todo.title).toBe("Steuererklärung abschicken");
    expect(todo.dueDate).toBeNull();
    expect(todo.dueTime).toBeNull();
    expect(todo.priority).toBeNull();
    expect(todo.done).toBe(false);
    expect(todo.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates a todo with all optional fields set", async () => {
    const todo = await createTodo({
      title: "Zahnarzttermin",
      dueDate: "2026-10-01",
      dueTime: "09:30",
      priority: "high",
    });
    expect(todo.dueDate).toBe("2026-10-01");
    expect(todo.dueTime).toBe("09:30");
    expect(todo.priority).toBe("high");
  });

  it("rejects an empty title", async () => {
    await expect(createTodo({ title: "" })).rejects.toThrow();
    await expect(createTodo({ title: "   " })).rejects.toThrow();
  });

  it("trims the title", async () => {
    const todo = await createTodo({ title: "  Wäsche waschen  " });
    expect(todo.title).toBe("Wäsche waschen");
  });

  it("gets a todo by id", async () => {
    const created = await createTodo({ title: "Post abholen" });
    const fetched = await getTodo(created.id);
    expect(fetched).toEqual(created);
  });

  it("throws when getting a nonexistent todo", async () => {
    await expect(getTodo("does-not-exist")).rejects.toThrow("Not found");
  });

  it("updates a todo's fields", async () => {
    const created = await createTodo({ title: "Post abholen" });
    const updated = await updateTodo(created.id, { title: "Post abholen (Paket)", priority: "normal" });
    expect(updated.title).toBe("Post abholen (Paket)");
    expect(updated.priority).toBe("normal");
  });

  it("marks a todo done via update", async () => {
    const created = await createTodo({ title: "Post abholen" });
    const updated = await updateTodo(created.id, { done: true });
    expect(updated.done).toBe(true);
  });

  it("rejects updating to an empty title", async () => {
    const created = await createTodo({ title: "Post abholen" });
    await expect(updateTodo(created.id, { title: "   " })).rejects.toThrow();
  });

  it("throws when updating a nonexistent todo", async () => {
    await expect(updateTodo("does-not-exist", { title: "x" })).rejects.toThrow("Not found");
  });

  it("deletes a todo", async () => {
    const created = await createTodo({ title: "Post abholen" });
    await deleteTodo(created.id);
    await expect(getTodo(created.id)).rejects.toThrow("Not found");
  });

  it("does not throw deleting a nonexistent todo", async () => {
    await expect(deleteTodo("does-not-exist")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/todos.test.ts`
Expected: FAIL — `../todos` doesn't exist yet.

- [ ] **Step 3: Add the `todos` table to the schema**

In `src/lib/storage/db.ts`, add after the `MilestoneRecord` interface:

```ts
export interface TodoRecord {
  id: string;
  title: string;
  /** "YYYY-MM-DD" or null for no due date. */
  dueDate: string | null;
  /** "HH:mm", only meaningful when dueDate is set. */
  dueTime: string | null;
  priority: "low" | "normal" | "high" | null;
  done: boolean;
  /** "YYYY-MM-DD" — the day the todo was created, UTC. */
  createdAt: string;
}
```

Update the `RitualDb` type:

```ts
type RitualDb = Dexie & {
  categories: EntityTable<CategoryRecord, "id">;
  goals: EntityTable<GoalRecord, "id">;
  entries: EntityTable<EntryRecord, "id">;
  milestones: EntityTable<MilestoneRecord, "id">;
  todos: EntityTable<TodoRecord, "id">;
};
```

Add a new version block after the existing `db.version(1).stores({...})` (do not modify the `version(1)` block — Dexie needs both to migrate correctly):

```ts
db.version(2).stores({
  categories: "id, name",
  goals: "id, archived, categoryId, createdAt",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
  todos: "id, done, dueDate",
});
```

- [ ] **Step 4: Create `src/lib/storage/todos.ts`**

```ts
import { db, type TodoRecord } from "./db";
import { generateId } from "./id";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreateTodoInput {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: "low" | "normal" | "high" | null;
}

export async function createTodo(input: CreateTodoInput): Promise<TodoRecord> {
  if (!input.title || !input.title.trim()) {
    throw new Error("title is required.");
  }
  const todo: TodoRecord = {
    id: generateId(),
    title: input.title.trim(),
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    priority: input.priority ?? null,
    done: false,
    createdAt: todayString(),
  };
  await db.todos.add(todo);
  return todo;
}

export async function getTodo(id: string): Promise<TodoRecord> {
  const todo = await db.todos.get(id);
  if (!todo) throw new Error("Not found");
  return todo;
}

export async function updateTodo(
  id: string,
  patch: Partial<CreateTodoInput> & { done?: boolean }
): Promise<TodoRecord> {
  const existing = await db.todos.get(id);
  if (!existing) throw new Error("Not found");
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("title is required.");
  }
  const changes: Partial<TodoRecord> = { ...patch };
  if (patch.title !== undefined) changes.title = patch.title.trim();
  await db.todos.update(id, changes);
  return (await db.todos.get(id)) as TodoRecord;
}

export async function deleteTodo(id: string): Promise<void> {
  await db.todos.delete(id);
}
```

- [ ] **Step 5: Run to verify all tests pass**

Run: `npx vitest run src/lib/storage/__tests__/todos.test.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: Both clean — the new table is purely additive, no existing file references it yet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/todos.ts src/lib/storage/__tests__/todos.test.ts
git commit -m "feat: add todos table and basic CRUD storage functions"
```

---

### Task 2: `listTodos` / `getDashboardTodos`

**Files:**
- Modify: `src/lib/storage/todos.ts`
- Test: `src/lib/storage/__tests__/todos.test.ts`

**Interfaces:**
- Consumes: `TodoRecord`, `createTodo` (Task 1).
- Produces: `listTodos(options?: { done?: boolean }): Promise<TodoRecord[]>` (sorted by `dueDate` ascending, `null` last; unfiltered when `options.done` is omitted), `getDashboardTodos(): Promise<TodoRecord[]>` (open todos that are overdue, due today, or have no due date — same sort).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage/__tests__/todos.test.ts` (new `describe` blocks; the file already imports `createTodo`/`getTodo`/`updateTodo`/`deleteTodo` — extend that import line to include `listTodos` and `getDashboardTodos`):

```ts
describe("listTodos", () => {
  beforeEach(async () => {
    await db.todos.clear();
  });

  it("sorts by due date ascending, with no-date todos last", async () => {
    await createTodo({ title: "C - kein Datum" });
    await createTodo({ title: "A - früh", dueDate: "2026-10-01" });
    await createTodo({ title: "B - spät", dueDate: "2026-10-15" });

    const todos = await listTodos();
    expect(todos.map((t) => t.title)).toEqual(["A - früh", "B - spät", "C - kein Datum"]);
  });

  it("filters to only open todos when done is false", async () => {
    const a = await createTodo({ title: "Offen" });
    const b = await createTodo({ title: "Erledigt" });
    await updateTodo(b.id, { done: true });

    const open = await listTodos({ done: false });
    expect(open.map((t) => t.id)).toEqual([a.id]);
  });

  it("filters to only done todos when done is true", async () => {
    const a = await createTodo({ title: "Offen" });
    const b = await createTodo({ title: "Erledigt" });
    await updateTodo(b.id, { done: true });

    const done = await listTodos({ done: true });
    expect(done.map((t) => t.id)).toEqual([b.id]);
  });

  it("returns every todo, done or not, when no filter is given", async () => {
    const a = await createTodo({ title: "Offen" });
    const b = await createTodo({ title: "Erledigt" });
    await updateTodo(b.id, { done: true });

    const all = await listTodos();
    expect(all).toHaveLength(2);
  });
});

describe("getDashboardTodos", () => {
  const utcToday = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  };
  const daysAgo = (n: number) => {
    const d = utcToday();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  beforeEach(async () => {
    await db.todos.clear();
  });

  it("includes an overdue todo", async () => {
    await createTodo({ title: "Überfällig", dueDate: daysAgo(2) });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).toContain("Überfällig");
  });

  it("includes a todo due today", async () => {
    await createTodo({ title: "Heute", dueDate: daysAgo(0) });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).toContain("Heute");
  });

  it("includes a todo with no due date", async () => {
    await createTodo({ title: "Ohne Datum" });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).toContain("Ohne Datum");
  });

  it("excludes a todo due in the future", async () => {
    await createTodo({ title: "Zukunft", dueDate: daysAgo(-3) });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).not.toContain("Zukunft");
  });

  it("excludes an already-done todo even if overdue", async () => {
    const todo = await createTodo({ title: "Erledigt trotz überfällig", dueDate: daysAgo(2) });
    await updateTodo(todo.id, { done: true });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).not.toContain("Erledigt trotz überfällig");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/todos.test.ts`
Expected: FAIL — `listTodos`/`getDashboardTodos` don't exist yet.

- [ ] **Step 3: Implement `listTodos` and `getDashboardTodos`**

Add to `src/lib/storage/todos.ts`, and add `import { utcToday } from "@/lib/domain/window";` to its imports:

```ts
function compareTodos(a: TodoRecord, b: TodoRecord): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

export async function listTodos(options?: { done?: boolean }): Promise<TodoRecord[]> {
  const all = await db.todos.toArray();
  const filtered = options?.done === undefined ? all : all.filter((t) => t.done === options.done);
  return filtered.sort(compareTodos);
}

/**
 * What's "due now" on the dashboard — overdue, due today, or with no due
 * date at all (which would otherwise never surface anywhere but the full
 * `/todos` list). Never a future-dated open todo.
 */
export async function getDashboardTodos(): Promise<TodoRecord[]> {
  const todayStr = utcToday().toISOString().slice(0, 10);
  const open = await listTodos({ done: false });
  return open.filter((t) => t.dueDate === null || t.dueDate <= todayStr);
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx vitest run src/lib/storage/__tests__/todos.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: Both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/todos.ts src/lib/storage/__tests__/todos.test.ts
git commit -m "feat: add listTodos and getDashboardTodos with due-date sorting/filtering"
```

---

### Task 3: `TodoRow` display component

**Files:**
- Create: `src/components/TodoRow.tsx`

**Interfaces:**
- Consumes: `TodoRecord` (Task 1).
- Produces: `TodoRow({ todo, todayStr, onToggleDone, editable }: { todo: TodoRecord; todayStr: string; onToggleDone: (id: string, done: boolean) => void; editable?: boolean })` — a pure presentational component; the caller owns persisting the toggle and removing the item from its list.

No automated test — pure presentational UI, verified manually alongside Tasks 5 and 8 (its two consumers), per this project's convention (domain/storage is unit-tested, UI is verified manually).

- [ ] **Step 1: Create `src/components/TodoRow.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { TodoRecord } from "@/lib/storage/db";

const PRIORITY_LABELS: Record<NonNullable<TodoRecord["priority"]>, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
};

const PRIORITY_VARIANTS: Record<NonNullable<TodoRecord["priority"]>, "outline" | "secondary" | "destructive"> = {
  low: "outline",
  normal: "secondary",
  high: "destructive",
};

function formatDueDate(dueDate: string, dueTime: string | null): string {
  const formatted = `${dueDate.slice(8, 10)}.${dueDate.slice(5, 7)}.`;
  return dueTime ? `${formatted} ${dueTime}` : formatted;
}

export function TodoRow({
  todo,
  todayStr,
  onToggleDone,
  editable = false,
}: {
  todo: TodoRecord;
  todayStr: string;
  onToggleDone: (id: string, done: boolean) => void;
  editable?: boolean;
}) {
  const overdue = todo.dueDate !== null && todo.dueDate < todayStr;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 backdrop-blur-xl">
      <Checkbox checked={todo.done} onCheckedChange={(checked) => onToggleDone(todo.id, checked === true)} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`truncate text-sm font-medium ${todo.done ? "text-muted-foreground line-through" : ""}`}>
          {todo.title}
        </p>
        {(todo.dueDate || todo.priority) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {todo.dueDate && (
              <Badge variant={overdue ? "destructive" : "outline"} className="font-mono">
                {formatDueDate(todo.dueDate, todo.dueTime)}
              </Badge>
            )}
            {todo.priority && <Badge variant={PRIORITY_VARIANTS[todo.priority]}>{PRIORITY_LABELS[todo.priority]}</Badge>}
          </div>
        )}
      </div>
      {editable && (
        <Link
          href={`/todos/${todo.id}/edit`}
          className="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Bearbeiten
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean (component isn't imported anywhere yet, but must still compile standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/TodoRow.tsx
git commit -m "feat: add TodoRow display component"
```

---

### Task 4: `TodoForm` component

**Files:**
- Create: `src/components/TodoForm.tsx`

**Interfaces:**
- Consumes: `createTodo`, `updateTodo` (Task 1), `TodoRecord` (Task 1).
- Produces: `ExistingTodo { id: string; title: string; dueDate: string | null; dueTime: string | null; priority: TodoRecord["priority"] }`, `TodoForm({ existingTodo }: { existingTodo?: ExistingTodo })` — mirrors `GoalForm`'s create/edit dual-purpose pattern.

No automated test — form UI, verified manually alongside Tasks 5 and 6 (its two consumers).

- [ ] **Step 1: Create `src/components/TodoForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTodo, updateTodo } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";

export interface ExistingTodo {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: TodoRecord["priority"];
}

const PRIORITY_OPTIONS: { value: TodoRecord["priority"]; label: string }[] = [
  { value: null, label: "Keine" },
  { value: "low", label: "Niedrig" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
];

function PriorityToggle({
  value,
  onChange,
}: {
  value: TodoRecord["priority"];
  onChange: (v: TodoRecord["priority"]) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-1">
      {PRIORITY_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === opt.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TodoForm({ existingTodo }: { existingTodo?: ExistingTodo }) {
  const router = useRouter();
  const [title, setTitle] = useState(existingTodo?.title ?? "");
  const [dueDate, setDueDate] = useState(existingTodo?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(existingTodo?.dueTime ?? "");
  const [priority, setPriority] = useState<TodoRecord["priority"]>(existingTodo?.priority ?? null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      title,
      dueDate: dueDate ? dueDate : null,
      dueTime: dueDate && dueTime ? dueTime : null,
      priority,
    };
    try {
      if (existingTodo) {
        await updateTodo(existingTodo.id, input);
      } else {
        await createTodo(input);
      }
      router.push("/todos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6 backdrop-blur-xl">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. Steuererklärung abschicken"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dueDate">Fällig am (optional)</Label>
          <Input
            id="dueDate"
            type="date"
            className="font-mono"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueTime">Uhrzeit (optional)</Label>
          <Input
            id="dueTime"
            type="time"
            className="font-mono"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            disabled={!dueDate}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Priorität</Label>
        <PriorityToggle value={priority} onChange={setPriority} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">
        {existingTodo ? "Speichern" : "ToDo anlegen"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/TodoForm.tsx
git commit -m "feat: add TodoForm component for creating and editing todos"
```

---

### Task 5: `/todos/new` and `/todos/[id]/edit` pages

**Files:**
- Create: `src/app/todos/new/page.tsx`
- Create: `src/app/todos/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `TodoForm`, `ExistingTodo` (Task 4), `getTodo`, `deleteTodo` (Task 1).

No automated test — page UI, verified manually in this task's own Step 4.

- [ ] **Step 1: Create `src/app/todos/new/page.tsx`**

```tsx
import { TodoForm } from "@/components/TodoForm";

export default function NewTodoPage() {
  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Neues ToDo</h1>
      <TodoForm />
    </main>
  );
}
```

- [ ] **Step 2: Create `src/app/todos/[id]/edit/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { TodoForm, type ExistingTodo } from "@/components/TodoForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getTodo, deleteTodo } from "@/lib/storage/todos";

export default function EditTodoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [todo, setTodo] = useState<ExistingTodo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getTodo(params.id)
      .then(setTodo)
      .catch((err) => setError(err instanceof Error ? err.message : "ToDo nicht gefunden."));
  }, [params.id]);

  async function handleConfirm() {
    setDeleteError(null);
    try {
      await deleteTodo(params.id);
      router.push("/todos");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  if (error) return <main className="px-6 py-10 text-destructive">{error}</main>;
  if (!todo) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">ToDo bearbeiten</h1>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2 /> Löschen
              </Button>
            }
          />
          <DialogContent role="alertdialog">
            <DialogHeader>
              <DialogTitle>ToDo wirklich löschen?</DialogTitle>
              <DialogDescription>
                „{todo.title}" wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.
              </DialogDescription>
            </DialogHeader>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" autoFocus>Abbrechen</Button>} />
              <Button variant="destructive" onClick={handleConfirm}>
                Endgültig löschen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <TodoForm existingTodo={todo} />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean.

- [ ] **Step 4: Manual Playwright verification**

Start the dev server. Navigate to `/todos/new`, create a todo with all fields set, confirm redirect to `/todos` (this page doesn't exist until Task 6 — a 404 here is expected and fine for this step; verify via a direct IndexedDB read instead that the todo was created with the right fields). Navigate to `/todos/<id>/edit` for that todo, confirm the form is pre-filled, change the title, save, confirm the IndexedDB row updated. Open the delete dialog, cancel it (row still exists), then confirm deletion (row gone). Clean up any leftover dev server process afterward.

- [ ] **Step 5: Commit**

```bash
git add src/app/todos/new/page.tsx "src/app/todos/[id]/edit/page.tsx"
git commit -m "feat: add todo create and edit pages"
```

---

### Task 6: `/todos` full list page

**Files:**
- Create: `src/app/todos/page.tsx`

**Interfaces:**
- Consumes: `TodoRow` (Task 3), `listTodos`, `updateTodo` (Task 1/2), `TodoRecord` (Task 1).

No automated test — page UI, verified manually in this task's own Step 3.

- [ ] **Step 1: Create `src/app/todos/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TodoRow } from "@/components/TodoRow";
import { buttonVariants } from "@/components/ui/button";
import { listTodos, updateTodo } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";
import { utcToday } from "@/lib/domain/window";

export default function TodosPage() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const todayStr = utcToday().toISOString().slice(0, 10);

  const load = useCallback(async (t: "open" | "done") => {
    setTodos(await listTodos({ done: t === "done" }));
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function handleToggleDone(id: string, done: boolean) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await updateTodo(id, { done });
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">ToDos</h1>
        <Link href="/todos/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> Neues ToDo
        </Link>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/50 p-1">
        {(["open", "done"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "open" ? "Offen" : "Erledigt"}
          </button>
        ))}
      </div>

      {todos.length === 0 ? (
        <p className="text-muted-foreground">{tab === "open" ? "Keine offenen ToDos." : "Noch nichts erledigt."}</p>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} todayStr={todayStr} onToggleDone={handleToggleDone} editable />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean.

- [ ] **Step 3: Manual Playwright verification**

Seed 2-3 todos directly via IndexedDB (mix of overdue/today/future/no-date, some done). Navigate to `/todos`, confirm the "Offen" tab shows the right sorted set (due-date ascending, no-date last) and excludes done ones. Check off one via its checkbox, confirm it disappears immediately from view and the underlying IndexedDB row now has `done: true`. Switch to the "Erledigt" tab, confirm it appears there. Clean up seeded data and kill the dev server afterward.

- [ ] **Step 4: Commit**

```bash
git add "src/app/todos/page.tsx"
git commit -m "feat: add full todos list page with open/done tabs"
```

---

### Task 7: Dashboard two-column layout with ToDos

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `TodoRow` (Task 3), `getDashboardTodos`, `updateTodo` (Task 1/2), `TodoRecord` (Task 1).

No automated test — page UI, verified manually in this task's own Step 4.

- [ ] **Step 1: Replace the full contents of `src/app/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { GoalCard } from "@/components/GoalCard";
import { TodoRow } from "@/components/TodoRow";
import { buttonVariants } from "@/components/ui/button";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { GOAL_TEMPLATES } from "@/lib/domain/goalTemplates";
import { listGoalsWithProgress, createGoal, type GoalWithProgress } from "@/lib/storage/goals";
import { getDashboardTodos, updateTodo } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";
import { utcToday } from "@/lib/domain/window";
import {
  countOpenGoals,
  maybeShowReminder,
  isRemindersEnabled,
  shouldNotifyForGoal,
  goalReminderMessage,
  goalReminderStorageKey,
} from "@/lib/reminders";
import { useUserName } from "@/components/OnboardingGate";
import { possessive } from "@/lib/user";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });

function completionRatio(goal: GoalWithProgress): number {
  if (goal.type === "boolean") return goal.todayEntry?.done ? 1 : 0;
  const target = goal.targetValue ?? 0;
  if (target <= 0) return 0;
  return Math.min((goal.todayEntry?.value ?? 0) / target, 1);
}

function checkGoalReminders(goals: GoalWithProgress[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  for (const goal of goals) {
    if (!goal.reminderTime) continue;
    // A goal already skipped today was a deliberate decision not to do it —
    // nagging about it anyway would undercut the point of being able to skip.
    const isOpen = goal.todayEntry?.skipped
      ? false
      : goal.type === "boolean"
        ? !(goal.todayEntry?.done ?? false)
        : (goal.todayEntry?.value ?? 0) < (goal.targetValue ?? Infinity);
    const key = goalReminderStorageKey(goal.id);
    const fire = shouldNotifyForGoal({
      reminderTime: goal.reminderTime,
      isOpen,
      enabled: isRemindersEnabled(),
      permissionGranted: true,
      now,
      lastNotifiedKey: localStorage.getItem(key),
      todayKey,
    });
    if (!fire) continue;
    new Notification("Ritual", { body: goalReminderMessage(goal.title) });
    localStorage.setItem(key, todayKey);
  }
}

export default function DashboardPage() {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const today = new Date();
  const todayStr = utcToday().toISOString().slice(0, 10);
  const userName = useUserName();

  const load = useCallback(async () => {
    const data = await listGoalsWithProgress();
    setGoals(data);
    maybeShowReminder(countOpenGoals(data));
  }, []);

  const loadTodos = useCallback(async () => {
    setTodos(await getDashboardTodos());
  }, []);

  useEffect(() => {
    listGoalsWithProgress().then((data) => {
      setGoals(data);
      maybeShowReminder(countOpenGoals(data));
    });
    loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    const interval = setInterval(() => {
      listGoalsWithProgress().then(checkGoalReminders);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function addTemplate(template: (typeof GOAL_TEMPLATES)[number]) {
    await createGoal(template);
    load();
  }

  async function handleToggleTodoDone(id: string, done: boolean) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await updateTodo(id, { done });
  }

  // A goal skipped for today was deliberately paused, not left incomplete —
  // it's excluded from the ratio entirely rather than counted as 0%.
  const activeGoals = goals.filter((g) => !g.todayEntry?.skipped);
  const percentDone =
    activeGoals.length > 0
      ? Math.round((activeGoals.reduce((sum, g) => sum + completionRatio(g), 0) / activeGoals.length) * 100)
      : 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-foreground">
            {WEEKDAY_FORMAT.format(today)}
          </p>
          <h1 className="font-heading text-4xl">{DATE_FORMAT.format(today)}</h1>
        </div>
        {goals.length > 0 && (
          <div className="text-right">
            <p className="font-mono text-3xl tabular-nums text-primary">
              <NumberTicker value={percentDone} className="font-mono text-current" />%
            </p>
            <p className="text-xs text-muted-foreground">heute erledigt</p>
          </div>
        )}
      </header>

      <div className="grid gap-8 sm:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {userName ? `${possessive(userName)} Ziele` : "Ziele"}
            </h2>
            <Link href="/goals/new" className={buttonVariants({ size: "sm" })}>
              <Plus /> Neues Ziel
            </Link>
          </div>

          {goals.length === 0 ? (
            <div className="space-y-4 rounded-xl border border-dashed p-6">
              <p className="text-center text-muted-foreground">
                Noch keine Ziele angelegt. Leg direkt los mit einer Vorlage:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_TEMPLATES.map((template) => (
                  <button
                    key={template.title}
                    type="button"
                    onClick={() => addTemplate(template)}
                    className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/30 p-4 text-center transition-colors hover:bg-muted"
                  >
                    <span className="text-2xl leading-none">{template.icon}</span>
                    <span className="text-sm">{template.title}</span>
                  </button>
                ))}
              </div>
              <div className="text-center">
                <Link href="/goals/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Oder eigenes Ziel anlegen
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onChecked={load} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">ToDos</h2>
            <div className="flex items-center gap-3">
              <Link
                href="/todos/new"
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Neues ToDo
              </Link>
              <Link
                href="/todos"
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Alle anzeigen
              </Link>
            </div>
          </div>

          {todos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nichts Dringendes offen.</p>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} todayStr={todayStr} onToggleDone={handleToggleTodoDone} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
```

Note the goal-template grid changed from `grid-cols-2 sm:grid-cols-3` to a flat `grid-cols-2`: the dashboard's own column is now half-width above `sm`, so a 3-column template grid would cramp inside it — 2 columns fits both the narrow (single-column, full-width) and the new half-width layouts without a jarring reflow between breakpoints. Also note `max-w-xl` on the `<main>` became `max-w-4xl` to give the two-column layout room — the single-column mobile view is unaffected since it already fills the viewport width regardless of `max-w`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean.

- [ ] **Step 3: Run the full automated suite**

Run: `npm test -- --run`
Expected: All passing — this task touches no test files, so this just confirms nothing broke.

- [ ] **Step 4: Manual Playwright verification**

Resize to a desktop width (e.g. 1024px) and confirm Ziele/ToDos render as two side-by-side columns; resize to a mobile width (390px) and confirm they stack (Ziele first, then ToDos). Seed a due-today todo and an overdue todo via IndexedDB, reload, confirm both appear in the dashboard's ToDo column and a future-dated one does not. Check one off, confirm it disappears immediately and the dashboard's own todo list no longer contains it. Confirm the "heute erledigt" percentage still computes correctly (spot-check against the existing goals). Clean up seeded data and kill the dev server afterward.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add two-column dashboard layout with a ToDos section"
```

---

### Task 8: `NewMenu` + NavBar wiring

**Files:**
- Create: `src/components/NewMenu.tsx`
- Modify: `src/components/NavBar.tsx`

**Interfaces:**
- Consumes: `Popover`, `PopoverTrigger`, `PopoverContent` (existing, from `src/components/ui/popover.tsx`).
- Produces: `NewMenu({ triggerClassName, side, align, children }: { triggerClassName?: string; side?: "top" | "bottom" | "left" | "right"; align?: "start" | "center" | "end"; children: React.ReactNode })`.

No automated test — pure UI, verified manually in this task's own Step 4.

- [ ] **Step 1: Create `src/components/NewMenu.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A single "create new" entry point that picks between the two things this
 * app lets you create — a recurring Goal or a one-off ToDo — instead of the
 * nav bar committing to one or the other. Controlled `open` state (rather
 * than letting the popover manage its own) so a click on either link can
 * close the menu before the route change completes; NavBar persists across
 * navigations, so an uncontrolled popover would stay visually open.
 */
export function NewMenu({
  triggerClassName,
  side = "bottom",
  align = "end",
  children,
}: {
  triggerClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName}>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-44 space-y-1 p-1">
        <Link
          href="/goals/new"
          onClick={() => setOpen(false)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          Neues Ziel
        </Link>
        <Link
          href="/todos/new"
          onClick={() => setOpen(false)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          Neues ToDo
        </Link>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Wire it into `src/components/NavBar.tsx`**

Add the import:

```tsx
import { NewMenu } from "@/components/NewMenu";
```

Replace the desktop nav's existing "Neues Ziel" link:

```tsx
<Link href="/goals/new" className={buttonVariants({ size: "sm", className: "shrink-0" })}>
  <Plus /> Neues Ziel
</Link>
```

with:

```tsx
<NewMenu side="bottom" triggerClassName={buttonVariants({ size: "sm", className: "shrink-0" })}>
  <Plus /> Neu
</NewMenu>
```

Replace the mobile bottom tab bar's existing "Neu" link:

```tsx
<Link
  href="/goals/new"
  className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground transition-colors"
>
  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
    <Plus className="size-4" />
  </span>
  Neu
</Link>
```

with:

```tsx
<NewMenu
  side="top"
  align="center"
  triggerClassName="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground transition-colors"
>
  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
    <Plus className="size-4" />
  </span>
  Neu
</NewMenu>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean.

- [ ] **Step 4: Manual Playwright verification**

At desktop width: click the nav's "Neu" button, confirm the popover shows "Neues Ziel" and "Neues ToDo", click "Neues ToDo", confirm navigation to `/todos/new` and that the popover is gone (not still rendered open) when navigating back. At mobile width (390px): confirm the bottom tab bar's "Neu" button opens the same two-option menu (positioned above the tab bar, not clipped off-screen) and both options navigate correctly. Kill the dev server afterward.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewMenu.tsx src/components/NavBar.tsx
git commit -m "feat: replace the nav's single create-goal action with a Neu+ menu"
```

---

### Task 9: Finish the branch

**Files:** none (process step)

- [ ] **Step 1: Full verification sweep**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run && npm run build`
Expected: All clean, 0 test failures.

- [ ] **Step 2: Rebase onto latest `origin/main` and push**

Per this project's established workflow (memory `habit_tracker_workflow`): commit locally on `worktree-habit-tracker-mvp`, then push straight to `main`, no feature-branch PR.

```bash
git fetch origin main
git rebase origin/main
npx tsc --noEmit && npm test -- --run   # re-verify after rebase
git push origin worktree-habit-tracker-mvp:main
```

- [ ] **Step 3: Report to the user**

Summarize what shipped (todos data model + CRUD, dashboard two-column layout, full `/todos` list, `Neu +` creation menu) and how it was verified (test counts, manual Playwright checks performed). Note the two things intentionally deferred per the spec's "Out of Scope" section (calendar view, per-todo reminders — Phases B/C).
