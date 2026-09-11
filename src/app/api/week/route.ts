import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { utcToday } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

// Matches densify.ts's utcDayKey: entries are stored at UTC midnight, so keys
// must be derived from UTC date parts, not the server process's local time.
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const today = utcToday();
  const { start } = periodBounds(today, "week");

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(utcDayKey(d));
  }

  const goals = await db.goal.findMany({
    where: { userId, archived: false, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const entries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: start, lte: end } },
  });
  const entryByGoalAndDay = new Map(
    entries.map((e) => [`${e.goalId}_${utcDayKey(e.date)}`, { done: e.done, value: e.value }])
  );

  return NextResponse.json({
    days,
    goals: goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      icon: goal.icon,
      type: goal.type,
      unit: goal.unit,
      targetValue: goal.targetValue,
      step: goal.step,
      category: goal.category,
      entries: Object.fromEntries(
        days.map((day) => [day, entryByGoalAndDay.get(`${goal.id}_${day}`) ?? null])
      ),
    })),
  });
}
