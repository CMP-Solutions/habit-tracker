import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const existing = await db.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { title, description, type, unit, targetValue, periodicity, weeklyThreshold, categoryId, archived } = body;
  const goal = await db.goal.update({
    where: { id },
    data: { title, description, type, unit, targetValue, periodicity, weeklyThreshold, categoryId, archived },
  });
  return NextResponse.json(goal);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const existing = await db.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entryCount = await db.entry.count({ where: { goalId: id } });
  if (entryCount > 0) {
    return NextResponse.json({ error: "Goal has entries; archive it instead of deleting." }, { status: 409 });
  }

  await db.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
