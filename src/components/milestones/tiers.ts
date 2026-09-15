import { Award, Gem, Medal, Star, type LucideIcon } from "lucide-react";
import { STREAK_THRESHOLDS, TOTAL_COUNT_THRESHOLDS, type MilestoneAward } from "@/lib/domain/milestones";

export interface MilestoneTier {
  threshold: number;
  name: string;
  icon: LucideIcon;
  /** Tailwind classes for the badge's icon + ring when unlocked/active. */
  activeClassName: string;
}

// Ordered to match STREAK_THRESHOLDS — one named tier per streak length.
export const STREAK_TIERS: MilestoneTier[] = [
  { threshold: STREAK_THRESHOLDS[0], name: "Bronze", icon: Medal, activeClassName: "text-amber-600 ring-amber-600/40 bg-amber-600/15" },
  { threshold: STREAK_THRESHOLDS[1], name: "Silber", icon: Medal, activeClassName: "text-slate-300 ring-slate-300/40 bg-slate-300/15" },
  { threshold: STREAK_THRESHOLDS[2], name: "Gold", icon: Award, activeClassName: "text-yellow-400 ring-yellow-400/40 bg-yellow-400/15" },
  { threshold: STREAK_THRESHOLDS[3], name: "Platin", icon: Award, activeClassName: "text-cyan-300 ring-cyan-300/40 bg-cyan-300/15" },
  { threshold: STREAK_THRESHOLDS[4], name: "Diamant", icon: Gem, activeClassName: "text-violet-300 ring-violet-300/40 bg-violet-300/15" },
];

// A visually distinct shape/tint from the streak ladder, since it isn't part
// of the same 5-step progression — a single one-off milestone.
export const TOTAL_COUNT_TIER: MilestoneTier = {
  threshold: TOTAL_COUNT_THRESHOLDS[0],
  name: `${TOTAL_COUNT_THRESHOLDS[0]}x insgesamt`,
  icon: Star,
  activeClassName: "text-primary ring-primary/40 bg-primary/15",
};

export function tiersFor(type: MilestoneAward["type"]): MilestoneTier[] {
  return type === "streak" ? STREAK_TIERS : [TOTAL_COUNT_TIER];
}

export function tierFor(type: MilestoneAward["type"], threshold: number): MilestoneTier {
  const tier = tiersFor(type).find((t) => t.threshold === threshold);
  if (!tier) throw new Error(`No tier defined for ${type}:${threshold}`);
  return tier;
}
