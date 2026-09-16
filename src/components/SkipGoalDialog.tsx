"use client";

import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The confirmation step itself is the "mental hurdle" this is meant to add —
 * a deliberate pause before skipping, not a form the user must fill in. The
 * reason field stays optional; requiring it would just train people to type
 * filler text.
 */
export function SkipGoalDialog({
  open,
  onOpenChange,
  goalTitle,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalTitle: string;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");

  function handleConfirm() {
    onConfirm(reason.trim() ? reason.trim() : undefined);
    setReason("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>&ldquo;{goalTitle}&rdquo; heute überspringen?</DialogTitle>
          <DialogDescription>
            Ein Tag Pause ist völlig okay, wenn&apos;s einen guten Grund gibt. Aber lass dich nicht von
            bloßer Antriebslosigkeit abhalten — bleib dran!
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="skip-reason">Grund (optional)</Label>
          <Textarea
            id="skip-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z.B. krank, unterwegs, ..."
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus>Doch weitermachen</Button>} />
          <Button variant="destructive" onClick={handleConfirm}>
            Trotzdem überspringen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
