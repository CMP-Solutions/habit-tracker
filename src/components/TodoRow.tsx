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
