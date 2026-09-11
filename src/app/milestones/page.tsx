"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

interface MilestoneRow {
  id: string;
  type: string;
  threshold: number;
  achievedAt: string;
  goal: { title: string; icon: string | null };
}

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/milestones").then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Meilensteine konnten nicht geladen werden.");
        return;
      }
      setError(null);
      setMilestones(await res.json());
    });
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Meilensteine</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && milestones.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Noch keine Meilensteine erreicht.
        </div>
      )}
      <ul className="space-y-2">
        {milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-4 rounded-lg border bg-card p-4 backdrop-blur-xl">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-celebrate/15 text-celebrate">
              <Trophy className="size-5" />
            </span>
            <div>
              <p className="font-medium">
                {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {m.goal.icon && <span className="mr-1">{m.goal.icon}</span>}
                {m.goal.title} · {new Date(m.achievedAt).toLocaleDateString("de-DE")}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
