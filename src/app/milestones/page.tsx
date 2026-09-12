"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

interface AchievedMilestone {
  id: string;
  type: string;
  threshold: number;
  achievedAt: string;
  goal: { title: string; icon: string | null };
}

interface UpcomingMilestone {
  goalId: string;
  goalTitle: string;
  goalIcon: string | null;
  type: string;
  threshold: number;
  current: number;
}

interface MilestonesResponse {
  achieved: AchievedMilestone[];
  upcoming: UpcomingMilestone[];
}

function milestoneLabel(type: string, threshold: number): string {
  return type === "streak" ? `${threshold}-Tage-Streak` : `${threshold}x insgesamt geschafft`;
}

export default function MilestonesPage() {
  const [data, setData] = useState<MilestonesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/milestones").then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Meilensteine konnten nicht geladen werden.");
        return;
      }
      setError(null);
      setData(await res.json());
    });
  }, []);

  const achieved = data?.achieved ?? [];
  const upcoming = data?.upcoming ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
      <h1 className="font-heading text-3xl">Meilensteine</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!error && upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Als Nächstes</h2>
          <ul className="space-y-2">
            {upcoming.map((u) => {
              const percent = Math.min(Math.round((u.current / u.threshold) * 100), 100);
              return (
                <li
                  key={`${u.goalId}-${u.type}-${u.threshold}`}
                  className="rounded-lg border bg-card p-4 backdrop-blur-xl"
                >
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {u.goalIcon && <span className="text-base leading-none">{u.goalIcon}</span>}
                      {u.goalTitle}
                    </p>
                    <p className="shrink-0 font-mono text-xs text-muted-foreground">
                      {milestoneLabel(u.type, u.threshold)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {u.current}/{u.threshold}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        {upcoming.length > 0 && <h2 className="text-sm font-medium text-muted-foreground">Erreicht</h2>}
        {!error && achieved.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            Noch keine Meilensteine erreicht.
          </div>
        )}
        <ul className="space-y-2">
          {achieved.map((m) => (
            <li key={m.id} className="flex items-center gap-4 rounded-lg border bg-card p-4 backdrop-blur-xl">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-celebrate/15 text-celebrate">
                <Trophy className="size-5" />
              </span>
              <div>
                <p className="font-medium">{milestoneLabel(m.type, m.threshold)}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {m.goal.icon && <span className="mr-1">{m.goal.icon}</span>}
                  {m.goal.title} · {new Date(m.achievedAt).toLocaleDateString("de-DE")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
