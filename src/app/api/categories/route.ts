import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await db.category.findMany({
    where: { userId: (session.user as { id: string }).id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color, icon } = await req.json();
  if (!name || !color || !icon) {
    return NextResponse.json({ error: "name, color and icon are required." }, { status: 400 });
  }

  const category = await db.category.create({
    data: { userId: (session.user as { id: string }).id, name, color, icon },
  });
  return NextResponse.json(category, { status: 201 });
}
