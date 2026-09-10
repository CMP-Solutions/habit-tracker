import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { utcMidnightDaysAgo } from "@/lib/domain/window";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { searchParams } = new URL(req.url);
  const requestedDays = Number(searchParams.get("days") ?? 30);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.floor(requestedDays) : 30;

  // Inclusive window of `days` calendar days ending today, anchored at UTC
  // midnight so the boundary day is never half-included. `days = 365` therefore
  // covers exactly the 365 cells the Heatmap renders.
  const since = utcMidnightDaysAgo(days - 1);

  const goals = await db.goal.findMany({ where: { userId, archived: false } });
  const entries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: since } },
  });

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const byDate = new Map<string, { successCount: number; totalCount: number }>();

  for (const entry of entries) {
    const goal = goalById.get(entry.goalId)!;
    const key = entry.date.toISOString().slice(0, 10);
    const success = goal.type === "boolean" ? entry.done : (entry.value ?? 0) >= (goal.targetValue ?? Infinity);
    const existing = byDate.get(key) ?? { successCount: 0, totalCount: 0 };
    existing.totalCount += 1;
    if (success) existing.successCount += 1;
    byDate.set(key, existing);
  }

  const result = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return NextResponse.json(result);
}
