import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isGoalIcon } from "@/lib/domain/goalIcons";

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
  const {
    title,
    description,
    icon,
    type,
    unit,
    targetValue,
    periodicity,
    weeklyThreshold,
    periodUnit,
    periodTarget,
    categoryId,
    archived,
  } = body;

  if (icon !== undefined && icon !== null && !isGoalIcon(icon)) {
    return NextResponse.json({ error: "icon must be one of the supported goal icons." }, { status: 400 });
  }

  if (periodicity === "count_per_period") {
    const effectiveType = type ?? existing.type;
    if (effectiveType !== "boolean") {
      return NextResponse.json({ error: "count_per_period is only available for boolean goals." }, { status: 400 });
    }
    if (!["week", "month"].includes(periodUnit)) {
      return NextResponse.json({ error: "periodUnit must be 'week' or 'month'." }, { status: 400 });
    }
    if (!Number.isInteger(periodTarget) || periodTarget < 1) {
      return NextResponse.json({ error: "periodTarget must be a positive integer." }, { status: 400 });
    }
  }

  // A category may only be referenced by its owner (cross-tenant data leak).
  // `undefined` leaves the category unchanged; `null`/"" clears it.
  const normalizedCategoryId =
    categoryId === undefined ? undefined : categoryId ? String(categoryId) : null;
  if (normalizedCategoryId) {
    const category = await db.category.findFirst({ where: { id: normalizedCategoryId, userId } });
    if (!category) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
  }

  const goal = await db.goal.update({
    where: { id },
    data: {
      title,
      description,
      icon,
      type,
      unit,
      targetValue,
      periodicity,
      weeklyThreshold,
      periodUnit,
      periodTarget,
      categoryId: normalizedCategoryId,
      archived,
    },
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
