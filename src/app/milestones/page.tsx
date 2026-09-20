"use client";

import { useEffect, useState } from "react";
import { getMilestones } from "@/lib/storage/milestones";
import { MedalBadge } from "@/components/milestones/MedalBadge";
import { STREAK_TIERS, TOTAL_COUNT_TIER, tierFor, tiersFor, type MilestoneTier } from "@/components/milestones/tiers";

interface AchievedMilestone {
  id: string;
  type: "streak" | "total_count";
  threshold: number;
  achievedAt: string;
  goal: { title: string; icon: string | null };
}

interface UpcomingMilestone {
  goalId: string;
  goalTitle: string;
  goalIcon: string | null;
  type: "streak" | "total_count";
  threshold: number;
  current: number;
  achievedThresholds: number[];
}

interface MilestonesResponse {
  achieved: AchievedMilestone[];
  upcoming: UpcomingMilestone[];
}

function UpcomingDetails({
  u,
  tier,
  isAchieved,
  isActive,
}: {
  u: UpcomingMilestone;
  tier: MilestoneTier;
  isAchieved: boolean;
  isActive: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{tier.name}</p>
      <p className="text-xs text-muted-foreground italic">{tier.tagline}</p>
      <p className="text-xs text-muted-foreground">
        {u.type === "streak" ? `${tier.threshold} Tage Streak` : `${tier.threshold}x insgesamt`}
      </p>
      <p className="text-xs text-muted-foreground">
        {isAchieved
          ? "Bereits freigeschaltet"
          : isActive
            ? `${u.current} / ${u.threshold} — für ${u.goalTitle}`
            : "Noch nicht erreichbar"}
      </p>
    </div>
  );
}

export default function MilestonesPage() {
  const [data, setData] = useState<MilestonesResponse | null>(null);

  useEffect(() => {
    getMilestones().then(setData);
  }, []);

  const achieved = data?.achieved ?? [];
  const upcoming = data?.upcoming ?? [];
  const streakItems = upcoming.filter((u) => u.type === "streak");
  const totalItems = upcoming.filter((u) => u.type === "total_count");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
      <h1 className="font-heading text-3xl">Meilensteine</h1>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Als Nächstes</h2>

          {streakItems.length > 0 && (
            <ul className="space-y-3">
              {streakItems.map((u) => (
                <li
                  key={`${u.goalId}-${u.type}-${u.threshold}`}
                  className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    {u.goalIcon && <span className="text-base leading-none">{u.goalIcon}</span>}
                    {u.goalTitle}
                    <span className="font-mono text-xs font-normal whitespace-nowrap text-muted-foreground">
                      · {u.current} {u.current === 1 ? "Tag" : "Tage"} Streak
                    </span>
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {tiersFor(u.type).map((tier) => {
                      const isAchieved = u.achievedThresholds.includes(tier.threshold);
                      const isActive = tier.threshold === u.threshold;
                      const state = isAchieved ? "achieved" : isActive ? "active" : "locked";
                      return (
                        <MedalBadge
                          key={tier.threshold}
                          tier={tier}
                          state={state}
                          size="sm"
                          progress={isActive ? u.current / u.threshold : undefined}
                          details={<UpcomingDetails u={u} tier={tier} isAchieved={isAchieved} isActive={isActive} />}
                        />
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {totalItems.length > 0 && (
            <div className="rounded-lg border bg-card p-4 backdrop-blur-xl">
              <p className="mb-4 text-sm font-medium">{TOTAL_COUNT_TIER.threshold}x insgesamt</p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                {totalItems.map((u) => (
                  <li key={u.goalId} className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <p className="w-full text-xs leading-tight font-medium break-words">
                      {u.goalIcon && <span className="mr-1 text-sm leading-none">{u.goalIcon}</span>}
                      {u.goalTitle}
                    </p>
                    <MedalBadge
                      tier={TOTAL_COUNT_TIER}
                      state="active"
                      size="sm"
                      progress={u.current / u.threshold}
                      details={<UpcomingDetails u={u} tier={TOTAL_COUNT_TIER} isAchieved={false} isActive />}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          {(upcoming.length > 0 || achieved.length > 0) && (
            <h2 className="text-sm font-medium text-muted-foreground">Gesammelte Medaillen</h2>
          )}
          <details className="group text-xs text-muted-foreground">
            <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-2 select-none">
              Stufen anzeigen
            </summary>
            <div className="mt-3 space-y-2 rounded-lg border bg-card p-3 backdrop-blur-xl">
              {STREAK_TIERS.map((tier) => (
                <div key={tier.threshold} className="flex items-center gap-3">
                  <MedalBadge tier={tier} state="locked" size="sm" details={<p>{tier.name}</p>} />
                  <p>
                    <span className="font-medium text-foreground">{tier.name}</span>
                    <span className="italic"> „{tier.tagline}“</span> — {tier.threshold} Tage Streak
                  </p>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <MedalBadge tier={TOTAL_COUNT_TIER} state="locked" size="sm" details={<p>{TOTAL_COUNT_TIER.name}</p>} />
                <p>
                  <span className="font-medium text-foreground">{TOTAL_COUNT_TIER.name}</span> — insgesamt{" "}
                  {TOTAL_COUNT_TIER.threshold}x erfolgreich
                </p>
              </div>
            </div>
          </details>
        </div>

        {achieved.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            Noch keine Meilensteine erreicht.
          </div>
        )}

        {achieved.length > 0 && (
          <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4 backdrop-blur-xl">
            {achieved.map((m) => {
              const tier = tierFor(m.type, m.threshold);
              return (
                <MedalBadge
                  key={m.id}
                  tier={tier}
                  state="achieved"
                  details={
                    <div className="space-y-1">
                      <p className="font-medium">{tier.name}</p>
                      <p className="text-xs text-muted-foreground italic">{tier.tagline}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.type === "streak" ? `${m.threshold} Tage Streak` : `${m.threshold}x insgesamt`}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {m.goal.icon && <span>{m.goal.icon}</span>}
                        {m.goal.title} · {new Date(m.achievedAt).toLocaleDateString("de-DE")}
                      </p>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
