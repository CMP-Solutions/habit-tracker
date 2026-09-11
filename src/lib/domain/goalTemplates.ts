import type { GoalIcon } from "@/lib/domain/goalIcons";

export interface GoalTemplate {
  title: string;
  icon: GoalIcon;
  type: "boolean" | "quantitative";
  periodicity: "daily" | "weekly";
  unit?: string;
  targetValue?: number;
  weeklyThreshold?: number;
}

// A quick starting point for a brand-new account — not exhaustive, just
// varied enough (quantity, yes/no, daily, weekly) to show what's possible.
export const GOAL_TEMPLATES: GoalTemplate[] = [
  { title: "Wasser trinken", icon: "💧", type: "quantitative", periodicity: "daily", unit: "Liter", targetValue: 2 },
  { title: "Lesen", icon: "📖", type: "quantitative", periodicity: "daily", unit: "Minuten", targetValue: 15 },
  { title: "Keine Zigaretten", icon: "🚭", type: "boolean", periodicity: "daily" },
  { title: "Meditieren", icon: "🧘", type: "boolean", periodicity: "daily" },
  { title: "Sport machen", icon: "🏃", type: "boolean", periodicity: "weekly", weeklyThreshold: 3 },
  { title: "Früh schlafen", icon: "🌙", type: "boolean", periodicity: "daily" },
];
