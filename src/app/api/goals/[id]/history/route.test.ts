import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const daysAgo = (n: number) => {
  const d = utcToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

const key = (d: Date) => d.toISOString().slice(0, 10);

describe("GET /api/goals/[id]/history", () => {
  let userId: string;
  let goalId: string;

  beforeEach(async () => {
    await db.milestone.deleteMany({});
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "history-test@example.com" } });
    const user = await db.user.create({ data: { email: "history-test@example.com", passwordHash: "x" } });
    userId = user.id;
    const goal = await db.goal.create({
      data: { userId, title: "Sport", type: "boolean", periodicity: "daily", createdAt: daysAgo(4) },
    });
    goalId = goal.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  const load = async () => {
    const res = await GET(new Request("http://localhost/api/goals/x/history"), {
      params: Promise.resolve({ id: goalId }),
    });
    expect(res.status).toBe(200);
    return res.json();
  };

  it("returns a gapless day series from goal creation through today", async () => {
    await db.entry.create({ data: { goalId, date: daysAgo(4), done: true } });
    await db.entry.create({ data: { goalId, date: daysAgo(1), done: true } });

    const { results } = await load();
    expect(results.map((r: { date: string }) => r.date)).toEqual([4, 3, 2, 1, 0].map((n) => key(daysAgo(n))));
    expect(results.map((r: { success: boolean }) => r.success)).toEqual([true, false, false, true, false]);
  });

  it("includes today even for a goal created earlier today", async () => {
    await db.goal.update({ where: { id: goalId }, data: { createdAt: new Date() } });
    const { results } = await load();
    expect(results).toHaveLength(1);
    expect(results[0].date).toBe(key(utcToday()));
  });

  it("rejects a goal owned by another user with 404", async () => {
    const other = await db.user.create({ data: { email: "history-other@example.com", passwordHash: "x" } });
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: other.id },
    });
    const res = await GET(new Request("http://localhost/api/goals/x/history"), {
      params: Promise.resolve({ id: goalId }),
    });
    expect(res.status).toBe(404);
    await db.user.delete({ where: { id: other.id } });
  });
});
