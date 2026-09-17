"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { EventForm, type ExistingEvent } from "@/components/EventForm";
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
import { getEvent, deleteEvent } from "@/lib/storage/events";

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<ExistingEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getEvent(params.id)
      .then(setEvent)
      .catch((err) => setError(err instanceof Error ? err.message : "Termin nicht gefunden."));
  }, [params.id]);

  async function handleConfirm() {
    setDeleteError(null);
    try {
      await deleteEvent(params.id);
      router.push("/kalender");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  if (error) return <main className="px-6 py-10 text-destructive">{error}</main>;
  if (!event) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">Termin bearbeiten</h1>
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
              <DialogTitle>Termin wirklich löschen?</DialogTitle>
              <DialogDescription>
                {`„${event.title}" wird endgültig gelöscht (die gesamte Serie, falls wiederkehrend). Das kann nicht rückgängig gemacht werden.`}
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
      <EventForm existingEvent={event} />
    </main>
  );
}
