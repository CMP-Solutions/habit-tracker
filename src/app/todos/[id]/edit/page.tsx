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
                {`„${todo.title}" wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`}
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
