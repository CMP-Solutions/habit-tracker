// Curated so the picker stays a quick visual choice, not a full emoji keyboard.
export const GOAL_ICONS = [
  "💧", "🥗", "🍎", "🚭", "😴", "🏃", "🚴", "🏋️",
  "🧘", "🚶", "📖", "✍️", "🎨", "🎵", "🧹", "💊",
  "🦷", "🧴", "☀️", "🌙", "🛏️", "🚰", "📵", "🧠",
  "❤️", "🐶", "🌱", "💰", "🎯", "🙏",
] as const;

export type GoalIcon = (typeof GOAL_ICONS)[number];

export function isGoalIcon(value: unknown): value is GoalIcon {
  return typeof value === "string" && (GOAL_ICONS as readonly string[]).includes(value);
}
