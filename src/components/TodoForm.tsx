"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTodo, updateTodo, type TodoStatus } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";

export interface ExistingTodo {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: TodoRecord["priority"];
  status: TodoStatus;
}

const STATUS_OPTIONS: { value: TodoStatus; label: string }[] = [
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Arbeit" },
  { value: "deferred", label: "Zurückgestellt" },
  { value: "done", label: "Abgeschlossen (ToDo abhaken)" },
];

function StatusToggle({ value, onChange }: { value: TodoStatus; onChange: (v: TodoStatus) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-1">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
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
          aria-pressed={value === opt.value}
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
  // Old rows saved before the status field existed have none at runtime
  // despite the type — TodoRow derives the correct value from `done` for
  // display, but by the time a user opens the edit form correcting this
  // once is enough, so a plain "open" fallback keeps this simple.
  const [status, setStatus] = useState<TodoStatus>(existingTodo?.status ?? "open");
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
        await updateTodo(existingTodo.id, { ...input, status });
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

      {existingTodo && (
        <div className="space-y-2">
          <Label>Status</Label>
          <StatusToggle value={status} onChange={setStatus} />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">
        {existingTodo ? "Speichern" : "ToDo anlegen"}
      </Button>
    </form>
  );
}
