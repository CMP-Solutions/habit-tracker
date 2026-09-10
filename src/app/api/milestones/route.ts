import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const milestones = await db.milestone.findMany({
    where: { goal: { userId } },
    include: { goal: { select: { title: true } } },
    orderBy: { achievedAt: "desc" },
  });
  return NextResponse.json(milestones);
}
