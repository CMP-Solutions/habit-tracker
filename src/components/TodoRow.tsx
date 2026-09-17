"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TodoRecord } from "@/lib/storage/db";
import type { TodoStatus } from "@/lib/storage/todos";

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

// The "done" option spells out that picking it also checks the todo off —
// it's the same completion state as the checkbox, not a separate thing, and
// this is the one place that fact isn't otherwise visible.
const STATUS_LABELS: Record<TodoStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  deferred: "Zurückgestellt",
  done: "Abgeschlossen (ToDo abhaken)",
};

function formatDueDate(dueDate: string, dueTime: string | null): string {
  const formatted = `${dueDate.slice(8, 10)}.${dueDate.slice(5, 7)}.`;
  return dueTime ? `${formatted} ${dueTime}` : formatted;
}

export function TodoRow({
  todo,
  todayStr,
  onToggleDone,
  onStatusChange,
  editable = false,
}: {
  todo: TodoRecord;
  todayStr: string;
  onToggleDone: (id: string, done: boolean) => void;
  onStatusChange: (id: string, status: TodoStatus) => void;
  editable?: boolean;
}) {
  const overdue = todo.dueDate !== null && todo.dueDate < todayStr;
  // Rows created before the status field existed have none stored yet —
  // derive it from done rather than showing an empty selector.
  const status: TodoStatus = todo.status ?? (todo.done ? "done" : "open");

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
      <Select value={status} onValueChange={(v) => onStatusChange(todo.id, v as TodoStatus)}>
        <SelectTrigger size="sm" className="shrink-0">
          <SelectValue>{(v: string) => STATUS_LABELS[v as TodoStatus] ?? v}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">{STATUS_LABELS.open}</SelectItem>
          <SelectItem value="in_progress">{STATUS_LABELS.in_progress}</SelectItem>
          <SelectItem value="deferred">{STATUS_LABELS.deferred}</SelectItem>
          <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
        </SelectContent>
      </Select>
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
