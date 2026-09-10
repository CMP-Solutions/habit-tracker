"use client";

import { useEffect, useState } from "react";

interface MilestoneRow {
  id: string;
  type: string;
  threshold: number;
  achievedAt: string;
  goal: { title: string };
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
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Meilensteine</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && milestones.length === 0 && (
        <p className="text-muted-foreground">Noch keine Meilensteine erreicht.</p>
      )}
      <ul className="space-y-3">
        {milestones.map((m) => (
          <li key={m.id} className="rounded-lg border p-4">
            <p className="font-medium">
              🏆 {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
            </p>
            <p className="text-sm text-muted-foreground">
              {m.goal.title} · {new Date(m.achievedAt).toLocaleDateString("de-DE")}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
