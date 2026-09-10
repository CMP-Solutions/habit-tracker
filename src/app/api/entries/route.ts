import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DailyResult } from "@/lib/domain/streak";
import { groupIntoWeeks, evaluateWeek } from "@/lib/domain/weeklyGoal";
import { determineNewMilestones, MilestoneAward } from "@/lib/domain/milestones";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { goalId, date, done, value } = await req.json();
  const goal = await db.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dayDate = new Date(date + "T00:00:00Z");
  const entry = await db.entry.upsert({
    where: { goalId_date: { goalId, date: dayDate } },
    update: { done: !!done, value: value ?? null },
    create: { goalId, date: dayDate, done: !!done, value: value ?? null },
  });

  const allEntries = await db.entry.findMany({ where: { goalId }, orderBy: { date: "asc" } });
  const dailyResults: DailyResult[] = allEntries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  }

  const existingMilestones = await db.milestone.findMany({ where: { goalId } });
  const alreadyAwarded: MilestoneAward[] = existingMilestones.map((m) => ({
    type: m.type as "streak" | "total_count",
    threshold: m.threshold,
  }));

  const newMilestones = determineNewMilestones(evaluationResults, alreadyAwarded);
  if (newMilestones.length > 0) {
    await db.milestone.createMany({
      data: newMilestones.map((m) => ({ goalId, type: m.type, threshold: m.threshold })),
    });
  }

  return NextResponse.json({ entry, newMilestones });
}
