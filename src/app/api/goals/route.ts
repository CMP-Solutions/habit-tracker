import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { utcToday } from "@/lib/domain/window";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goals = await db.goal.findMany({
    where: { userId: (session.user as { id: string }).id, archived: false },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  // Today's entry per goal, so the dashboard can seed an already-checked-in
  // state. Entries are stored at UTC midnight, so "today" is the server's UTC
  // date — consistent with how entries are written (known timezone limitation).
  const today = utcToday();
  const todaysEntries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: today },
  });
  const entryByGoal = new Map(todaysEntries.map((e) => [e.goalId, e]));

  return NextResponse.json(
    goals.map((goal) => {
      const entry = entryByGoal.get(goal.id);
      return {
        ...goal,
        todayEntry: entry ? { done: entry.done, value: entry.value } : null,
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
    periodicity,
    weeklyThreshold,
    periodUnit,
    periodTarget,
    categoryId,
  } = body;

  if (
    !title ||
    !["boolean", "quantitative"].includes(type) ||
    !["daily", "weekly", "count_per_period"].includes(periodicity)
  ) {
    return NextResponse.json({ error: "title, valid type and periodicity are required." }, { status: 400 });
  }
  if (type === "quantitative" && (targetValue === undefined || targetValue === null)) {
    return NextResponse.json({ error: "targetValue is required for quantitative goals." }, { status: 400 });
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
      periodicity,
      weeklyThreshold,
      periodUnit: periodicity === "count_per_period" ? periodUnit : undefined,
      periodTarget: periodicity === "count_per_period" ? periodTarget : undefined,
      categoryId: normalizedCategoryId,
    },
  });
  return NextResponse.json(goal, { status: 201 });
}
