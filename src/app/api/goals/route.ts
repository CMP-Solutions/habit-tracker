import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goals = await db.goal.findMany({
    where: { userId: (session.user as { id: string }).id, archived: false },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(goals);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, type, unit, targetValue, periodicity, weeklyThreshold, categoryId } = body;

  if (!title || !["boolean", "quantitative"].includes(type) || !["daily", "weekly"].includes(periodicity)) {
    return NextResponse.json({ error: "title, valid type and periodicity are required." }, { status: 400 });
  }
  if (type === "quantitative" && (targetValue === undefined || targetValue === null)) {
    return NextResponse.json({ error: "targetValue is required for quantitative goals." }, { status: 400 });
  }
  if (periodicity === "weekly" && (weeklyThreshold === undefined || weeklyThreshold === null)) {
    return NextResponse.json({ error: "weeklyThreshold is required for weekly goals." }, { status: 400 });
  }

  const goal = await db.goal.create({
    data: {
      userId: (session.user as { id: string }).id,
      title,
      description,
      type,
      unit,
      targetValue,
      periodicity,
      weeklyThreshold,
      categoryId,
    },
  });
  return NextResponse.json(goal, { status: 201 });
}
