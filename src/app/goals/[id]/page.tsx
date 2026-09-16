"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trophy } from "lucide-react";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";
import { buttonVariants } from "@/components/ui/button";
import { getGoalHistory, type GoalHistory } from "@/lib/storage/goals";

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<GoalHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGoalHistory(params.id)
      .then((history) => {
        setError(null);
        setData(history);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ziel nicht gefunden."));
  }, [params.id]);

  if (error) return <main className="px-6 py-10 text-destructive">{error}</main>;
  if (!data) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-heading text-3xl">
            {data.goal.icon && <span className="text-2xl leading-none">{data.goal.icon}</span>}
            {data.goal.title}
          </h1>
          {data.goal.endDate && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Endet am {new Date(data.goal.endDate).toLocaleDateString("de-DE", { timeZone: "UTC" })}
            </p>
          )}
        </div>
        <Link href={`/goals/${params.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Pencil /> Bearbeiten
        </Link>
      </div>

      {data.goal.motivation && (
        <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground italic">
          „{data.goal.motivation}”
        </p>
      )}

      <div className="flex gap-8 rounded-xl border bg-card p-4 backdrop-blur-xl">
        <div>
          <p className="font-mono text-2xl tabular-nums text-primary">{data.currentStreak}</p>
          <p className="text-xs text-muted-foreground">aktuelle Serie</p>
        </div>
        <div>
          <p className="font-mono text-2xl tabular-nums text-foreground">{data.longestStreak}</p>
          <p className="text-xs text-muted-foreground">längste Serie</p>
        </div>
        <div>
          <p className="font-mono text-2xl tabular-nums text-foreground">{data.totalSuccessCount}</p>
          <p className="text-xs text-muted-foreground">insgesamt geschafft</p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Letzte 12 Monate</h2>
        <Heatmap results={data.results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Trend (7-Tage-Erfolgsquote)</h2>
        <TrendChart results={data.results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Meilensteine</h2>
        {data.milestones.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Meilensteine.</p>}
        <ul className="space-y-2">
          {data.milestones.map((m, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3 backdrop-blur-xl">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-celebrate/15 text-celebrate">
                <Trophy className="size-4" />
              </span>
              <p className="text-sm">
                {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
