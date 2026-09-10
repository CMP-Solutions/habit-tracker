import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { id } = await params;
  const goal = await db.goal.findUnique({ where: { id } });
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const since = new Date();
  since.setDate(since.getDate() - 365);

  const entries = await db.entry.findMany({
    where: { goalId: goal.id, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  const results = entries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  const milestones = await db.milestone.findMany({ where: { goalId: goal.id }, orderBy: { achievedAt: "asc" } });

  return NextResponse.json({ goal, results, milestones });
}
