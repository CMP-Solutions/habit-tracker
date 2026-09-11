"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { GoalForm, type ExistingGoal } from "@/components/GoalForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function EditGoalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<ExistingGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hasEntries, setHasEntries] = useState(false);

  useEffect(() => {
    fetch(`/api/goals/${params.id}/history`).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Ziel nicht gefunden.");
        return;
      }
      const data = await res.json();
      setGoal(data.goal);
    });
  }, [params.id]);

  async function handleDelete() {
    setDeleteError(null);
    const res = await fetch(`/api/goals/${params.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      return;
    }
    if (res.status === 409) {
      setHasEntries(true);
      setDeleteError("Dieses Ziel hat bereits Einträge und kann nicht gelöscht werden. Archiviere es stattdessen.");
      return;
    }
    const body = await res.json().catch(() => ({}));
    setDeleteError(body.error ?? "Löschen fehlgeschlagen.");
  }

  async function handleArchive() {
    setDeleteError(null);
    const res = await fetch(`/api/goals/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) {
      router.push("/");
      return;
    }
    const body = await res.json().catch(() => ({}));
    setDeleteError(body.error ?? "Archivieren fehlgeschlagen.");
  }

  if (error) return <main className="px-6 py-10 text-destructive">{error}</main>;
  if (!goal) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">Ziel bearbeiten</h1>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2 /> Löschen
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ziel wirklich löschen?</DialogTitle>
              <DialogDescription>
                {hasEntries
                  ? "Dieses Ziel hat bereits Einträge. Löschen ist nicht möglich, ohne die Historie zu verlieren — archiviere es stattdessen, um es aus der Übersicht auszublenden."
                  : `„${goal.title}" wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`}
              </DialogDescription>
            </DialogHeader>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              {hasEntries ? (
                <Button variant="default" onClick={handleArchive}>Archivieren</Button>
              ) : (
                <Button variant="destructive" onClick={handleDelete}>Endgültig löschen</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <GoalForm existingGoal={goal} />
    </main>
  );
}
