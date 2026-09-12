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

describe("GET /api/milestones", () => {
  let userId: string;

  beforeEach(async () => {
    await db.milestone.deleteMany({});
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "milestones-test@example.com" } });
    const user = await db.user.create({ data: { email: "milestones-test@example.com", passwordHash: "x" } });
    userId = user.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  const load = async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    return res.json();
  };

  it("reports upcoming progress toward the next unearned streak threshold", async () => {
    const goal = await db.goal.create({
      data: { userId, title: "Laufen", type: "boolean", periodicity: "daily", createdAt: daysAgo(3) },
    });
    for (let i = 3; i >= 0; i--) {
      await db.entry.create({ data: { goalId: goal.id, date: daysAgo(i), done: true } });
    }

    const { upcoming } = await load();
    expect(upcoming).toContainEqual({
      goalId: goal.id,
      goalTitle: "Laufen",
      goalIcon: null,
      type: "streak",
      threshold: 7,
      current: 4,
    });
  });

  it("omits a goal with no entries yet", async () => {
    await db.goal.create({ data: { userId, title: "Neu", type: "boolean", periodicity: "daily" } });
    const { upcoming } = await load();
    expect(upcoming).toEqual([]);
  });

  it("excludes archived goals from upcoming progress", async () => {
    const goal = await db.goal.create({
      data: { userId, title: "Alt", type: "boolean", periodicity: "daily", archived: true },
    });
    await db.entry.create({ data: { goalId: goal.id, date: utcToday(), done: true } });
    const { upcoming } = await load();
    expect(upcoming.some((u: { goalId: string }) => u.goalId === goal.id)).toBe(false);
  });

  it("skips to the 30-day threshold once the 7-day streak milestone is already awarded", async () => {
    const goal = await db.goal.create({
      data: { userId, title: "Meditieren", type: "boolean", periodicity: "daily", createdAt: daysAgo(1) },
    });
    await db.milestone.create({ data: { goalId: goal.id, type: "streak", threshold: 7 } });
    await db.entry.create({ data: { goalId: goal.id, date: daysAgo(1), done: true } });
    await db.entry.create({ data: { goalId: goal.id, date: utcToday(), done: true } });

    const { upcoming } = await load();
    const streakProgress = upcoming.find(
      (u: { goalId: string; type: string }) => u.goalId === goal.id && u.type === "streak"
    );
    expect(streakProgress.threshold).toBe(30);
  });

  it("still returns the achieved list as before", async () => {
    const goal = await db.goal.create({ data: { userId, title: "Sport", type: "boolean", periodicity: "daily" } });
    await db.milestone.create({ data: { goalId: goal.id, type: "streak", threshold: 7 } });
    const { achieved } = await load();
    expect(achieved).toHaveLength(1);
    expect(achieved[0].goal.title).toBe("Sport");
  });
});
