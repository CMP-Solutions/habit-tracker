"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { GoalForm, type ExistingGoal } from "@/components/GoalForm";
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
import { getGoalHistory, updateGoal, deleteGoal } from "@/lib/storage/goals";

export default function EditGoalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<ExistingGoal | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getGoalHistory(params.id)
      .then((data) => {
        setGoal(data.goal);
        setEntryCount(data.entryCount);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ziel nicht gefunden."));
  }, [params.id]);

  const willArchive = entryCount > 0;

  async function handleConfirm() {
    setDeleteError(null);
    try {
      if (willArchive) {
        await updateGoal(params.id, { archived: true });
      } else {
        await deleteGoal(params.id);
      }
      router.push("/");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : willArchive ? "Archivieren fehlgeschlagen." : "Löschen fehlgeschlagen."
      );
    }
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
          <DialogContent role="alertdialog">
            <DialogHeader>
              <DialogTitle>{willArchive ? "Ziel archivieren?" : "Ziel wirklich löschen?"}</DialogTitle>
              <DialogDescription>
                {willArchive
                  ? `„${goal.title}" hat bereits ${entryCount} ${entryCount === 1 ? "Eintrag" : "Einträge"}. Es wird archiviert statt gelöscht: es verschwindet aus Heute/Woche, deine bisherige Statistik und Meilensteine bleiben vollständig erhalten.`
                  : `„${goal.title}" hat noch keine Einträge und wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`}
              </DialogDescription>
            </DialogHeader>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" autoFocus>Abbrechen</Button>} />
              <Button variant={willArchive ? "default" : "destructive"} onClick={handleConfirm}>
                {willArchive ? "Archivieren" : "Endgültig löschen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <GoalForm existingGoal={goal} />
    </main>
  );
}
