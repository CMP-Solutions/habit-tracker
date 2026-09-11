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

describe("GET /api/stats", () => {
  let userId: string;

  beforeEach(async () => {
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "stats-test@example.com" } });
    const user = await db.user.create({ data: { email: "stats-test@example.com", passwordHash: "x" } });
    userId = user.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  const load = async (days = 30) => {
    const res = await GET(new Request(`http://localhost/api/stats?days=${days}`));
    expect(res.status).toBe(200);
    return res.json();
  };

  it("counts a backfilled entry dated before the goal's own createdAt", async () => {
    // Regression: a goal created "today" but backfilled via the Woche grid
    // for yesterday must still count toward that day's totals — backfilled
    // history is never rejected (PRODUCT.md), so createdAt can't exclude a
    // day that actually has a real entry on it.
    const goal = await db.goal.create({
      data: { userId, title: "Wasser trinken", type: "boolean", periodicity: "daily", createdAt: utcToday() },
    });
    await db.entry.create({ data: { goalId: goal.id, date: daysAgo(1), done: true } });

    const { daily } = await load();
    const yesterday = daily.find((d: { date: string }) => d.date === key(daysAgo(1)));
    expect(yesterday).toEqual({ date: key(daysAgo(1)), successCount: 1, totalCount: 1 });
  });

  it("excludes a goal from a day before it existed when no entry was backfilled", async () => {
    await db.goal.create({
      data: { userId, title: "Neu heute", type: "boolean", periodicity: "daily", createdAt: utcToday() },
    });
    const { daily } = await load();
    const yesterday = daily.find((d: { date: string }) => d.date === key(daysAgo(1)));
    expect(yesterday).toEqual({ date: key(daysAgo(1)), successCount: 0, totalCount: 0 });
  });
});
