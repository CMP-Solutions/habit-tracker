import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { utcToday, utcMidnightDaysAgo, parseUtcDateString } from "@/lib/domain/window";
import { periodBounds, PeriodUnit } from "@/lib/domain/periodCount";
import { isGoalIcon } from "@/lib/domain/goalIcons";
import { densifyDailyResults } from "@/lib/domain/densify";
import { calculateCurrentStreak } from "@/lib/domain/streak";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Today's entry per goal, so the dashboard can seed an already-checked-in
  // state. Entries are stored at UTC midnight, so "today" is the server's UTC
  // date — consistent with how entries are written (known timezone limitation).
  const today = utcToday();

  const goals = await db.goal.findMany({
    // A goal past its end date has naturally run its course: it drops off
    // "Heute"/"Woche" but stays in history (Auswertung/Meilensteine still
    // query goals directly, unaffected by this filter).
    where: {
      userId: (session.user as { id: string }).id,
      archived: false,
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
  const todaysEntries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: today },
  });
  const entryByGoal = new Map(todaysEntries.map((e) => [e.goalId, e]));

  const periodGoals = goals.filter((g) => g.periodicity === "count_per_period" && g.periodUnit && g.periodTarget != null);
  const periodProgressByGoal = new Map<string, { current: number; target: number }>();
  for (const goal of periodGoals) {
    const { start, end } = periodBounds(today, goal.periodUnit as PeriodUnit);
    const entries = await db.entry.findMany({
      where: { goalId: goal.id, date: { gte: start, lte: end } },
    });
    const current = entries.filter((e) =>
      goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity)
    ).length;
    periodProgressByGoal.set(goal.id, { current, target: goal.periodTarget as number });
  }

  // Current streak per goal, so the dashboard shows the product's core
  // promise (how long a streak has run), not just today's checkbox state.
  // Computed through yesterday, then today's already-fetched entry is added
  // on top — otherwise an unchecked "today" would zero out a real streak
  // before the user has even had a chance to check in.
  const since = utcMidnightDaysAgo(60);
  const yesterday = utcMidnightDaysAgo(1);
  const streakByGoal = new Map<string, number>();
  for (const goal of goals) {
    const entries = await db.entry.findMany({ where: { goalId: goal.id, date: { gte: since, lt: today } } });
    const createdDay = utcToday(goal.createdAt);
    const from = createdDay > since ? createdDay : since;
    const results = from > yesterday
      ? []
      : densifyDailyResults(
          entries.map((e) => ({
            date: e.date,
            success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
          })),
          from,
          yesterday
        );
    let streak = calculateCurrentStreak(results);
    const todayEntry = entryByGoal.get(goal.id);
    const todaySuccess = todayEntry
      ? goal.type === "boolean"
        ? todayEntry.done
        : (todayEntry.value ?? 0) >= (goal.targetValue ?? Infinity)
      : false;
    if (todaySuccess) streak++;
    streakByGoal.set(goal.id, streak);
  }

  return NextResponse.json(
    goals.map((goal) => {
      const entry = entryByGoal.get(goal.id);
      return {
        ...goal,
        todayEntry: entry ? { done: entry.done, value: entry.value } : null,
        periodProgress: periodProgressByGoal.get(goal.id) ?? null,
        currentStreak: streakByGoal.get(goal.id) ?? 0,
      };
    })
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json();
  const {
    title,
    description,
    type,
    unit,
    targetValue,
    step,
    periodicity,
    weeklyThreshold,
    periodUnit,
    periodTarget,
    categoryId,
    icon,
    endDate,
  } = body;

  const normalizedEndDate = endDate ? parseUtcDateString(endDate) : null;
  if (endDate && !normalizedEndDate) {
    return NextResponse.json({ error: "endDate must be a calendar date in YYYY-MM-DD format." }, { status: 400 });
  }

  if (
    !title ||
    !["boolean", "quantitative"].includes(type) ||
    !["daily", "weekly", "count_per_period"].includes(periodicity)
  ) {
    return NextResponse.json({ error: "title, valid type and periodicity are required." }, { status: 400 });
  }
  if (icon !== undefined && icon !== null && !isGoalIcon(icon)) {
    return NextResponse.json({ error: "icon must be one of the supported goal icons." }, { status: 400 });
  }
  if (type === "quantitative" && (targetValue === undefined || targetValue === null)) {
    return NextResponse.json({ error: "targetValue is required for quantitative goals." }, { status: 400 });
  }
  if (step !== undefined && (typeof step !== "number" || !(step > 0))) {
    return NextResponse.json({ error: "step must be a positive number." }, { status: 400 });
  }
  if (periodicity === "weekly" && (weeklyThreshold === undefined || weeklyThreshold === null)) {
    return NextResponse.json({ error: "weeklyThreshold is required for weekly goals." }, { status: 400 });
  }
  if (periodicity === "count_per_period") {
    if (type !== "boolean") {
      return NextResponse.json({ error: "count_per_period is only available for boolean goals." }, { status: 400 });
    }
    if (!["week", "month"].includes(periodUnit)) {
      return NextResponse.json({ error: "periodUnit must be 'week' or 'month'." }, { status: 400 });
    }
    if (!Number.isInteger(periodTarget) || periodTarget < 1) {
      return NextResponse.json({ error: "periodTarget must be a positive integer." }, { status: 400 });
    }
  }
  // A category may only be referenced by its owner — otherwise another user's
  // category name/color would be echoed back through GET /api/goals.
  const normalizedCategoryId: string | null = categoryId ? String(categoryId) : null;
  if (normalizedCategoryId) {
    const category = await db.category.findFirst({ where: { id: normalizedCategoryId, userId } });
    if (!category) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
  }

  const goal = await db.goal.create({
    data: {
      userId,
      title,
      description,
      type,
      unit,
      targetValue,
      step: type === "quantitative" ? (step ?? 1) : undefined,
      periodicity,
      weeklyThreshold,
      periodUnit: periodicity === "count_per_period" ? periodUnit : undefined,
      periodTarget: periodicity === "count_per_period" ? periodTarget : undefined,
      categoryId: normalizedCategoryId,
      icon: icon ?? undefined,
      endDate: normalizedEndDate,
    },
  });
  return NextResponse.json(goal, { status: 201 });
}
