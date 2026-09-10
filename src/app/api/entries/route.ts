import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DailyResult } from "@/lib/domain/streak";
import { densifyDailyResults } from "@/lib/domain/densify";
import { groupIntoWeeks, evaluateWeek } from "@/lib/domain/weeklyGoal";
import { groupIntoCalendarPeriods, evaluatePeriod, PeriodUnit } from "@/lib/domain/periodCount";
import { determineNewMilestones, MilestoneAward } from "@/lib/domain/milestones";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { goalId, date, done, value } = await req.json();

  if (typeof goalId !== "string" || goalId.length === 0) {
    return NextResponse.json({ error: "goalId is required." }, { status: 400 });
  }
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    return NextResponse.json({ error: "date must be a calendar date in YYYY-MM-DD format." }, { status: 400 });
  }
  const dayDate = new Date(date + "T00:00:00Z");
  if (Number.isNaN(dayDate.getTime()) || dayDate.toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: "date is not a valid calendar date." }, { status: 400 });
  }

  const goal = await db.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entry = await db.entry.upsert({
    where: { goalId_date: { goalId, date: dayDate } },
    update: { done: !!done, value: value ?? null },
    create: { goalId, date: dayDate, done: !!done, value: value ?? null },
  });

  const allEntries = await db.entry.findMany({ where: { goalId }, orderBy: { date: "asc" } });
  const recorded = allEntries.map((e) => ({
    date: e.date,
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  // Streaks are calendar based: every day between the first recorded day and
  // the most recently recorded one must be present, so that days without an
  // entry break the streak instead of silently disappearing.
  const firstRecorded = recorded[0]?.date ?? dayDate;
  const from = goal.createdAt < firstRecorded ? goal.createdAt : firstRecorded;
  const lastRecorded = recorded[recorded.length - 1]?.date ?? dayDate;
  const dailyResults: DailyResult[] = densifyDailyResults(recorded, from, lastRecorded);

  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  } else if (
    goal.periodicity === "count_per_period" &&
    (goal.periodUnit === "week" || goal.periodUnit === "month") &&
    goal.periodTarget != null
  ) {
    const periods = groupIntoCalendarPeriods(
      dailyResults.map((d) => ({ date: d.date, success: d.success })),
      goal.periodUnit as PeriodUnit
    );
    evaluationResults = periods.map((period) => ({
      date: period[0].date,
      success: evaluatePeriod(period, goal.periodTarget as number),
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
