import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

describe("/api/goals", () => {
  let userId: string;

  beforeEach(async () => {
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.category.deleteMany({});
    await db.user.deleteMany({ where: { email: { in: ["goal-test@example.com", "goal-other@example.com"] } } });
    const user = await db.user.create({ data: { email: "goal-test@example.com", passwordHash: "x" } });
    userId = user.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  it("creates a daily boolean goal and lists it", async () => {
    const createRes = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Keine Süßigkeiten",
          type: "boolean",
          periodicity: "daily",
        }),
      })
    );
    expect(createRes.status).toBe(201);

    const listRes = await GET();
    const goals = await listRes.json();
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe("Keine Süßigkeiten");
  });

  it("creates a weekly quantitative goal with target and threshold", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "3 Liter Wasser",
          type: "quantitative",
          unit: "Liter",
          targetValue: 3,
          periodicity: "weekly",
          weeklyThreshold: 5,
        }),
      })
    );
    const goal = await res.json();
    expect(goal.targetValue).toBe(3);
    expect(goal.weeklyThreshold).toBe(5);
  });

  it("rejects a quantitative goal without targetValue", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({ title: "Bad goal", type: "quantitative", periodicity: "daily" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a categoryId that belongs to another user", async () => {
    const other = await db.user.create({ data: { email: "goal-other@example.com", passwordHash: "x" } });
    const foreignCategory = await db.category.create({
      data: { userId: other.id, name: "Fremd", color: "#ff0000", icon: "lock" },
    });

    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Geklaute Kategorie",
          type: "boolean",
          periodicity: "daily",
          categoryId: foreignCategory.id,
        }),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid category.");
    expect(await db.goal.count()).toBe(0);
  });

  it("accepts a categoryId owned by the requesting user", async () => {
    const category = await db.category.create({
      data: { userId, name: "Eigen", color: "#22c55e", icon: "heart" },
    });
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Mit Kategorie",
          type: "boolean",
          periodicity: "daily",
          categoryId: category.id,
        }),
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).categoryId).toBe(category.id);
  });

  it("includes today's entry so the dashboard can seed its checked state", async () => {
    const goal = await db.goal.create({
      data: { userId, title: "Lesen", type: "boolean", periodicity: "daily" },
    });
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await db.entry.create({ data: { goalId: goal.id, date: today, done: true } });

    const goals = await (await GET()).json();
    expect(goals).toHaveLength(1);
    expect(goals[0].todayEntry).toEqual({ done: true, value: null });
  });

  it("reports a null todayEntry when there is no check-in today", async () => {
    await db.goal.create({ data: { userId, title: "Laufen", type: "boolean", periodicity: "daily" } });
    const goals = await (await GET()).json();
    expect(goals[0].todayEntry).toBeNull();
  });

  it("creates a count_per_period goal with periodUnit and periodTarget", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "3x pro Woche Fitness",
          type: "boolean",
          periodicity: "count_per_period",
          periodUnit: "week",
          periodTarget: 3,
        }),
      })
    );
    expect(res.status).toBe(201);
    const goal = await res.json();
    expect(goal.periodUnit).toBe("week");
    expect(goal.periodTarget).toBe(3);
  });

  it("rejects a count_per_period goal without periodUnit/periodTarget", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({ title: "Bad goal", type: "boolean", periodicity: "count_per_period" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a count_per_period goal for a quantitative type", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Bad goal",
          type: "quantitative",
          periodicity: "count_per_period",
          periodUnit: "week",
          periodTarget: 3,
          targetValue: 5,
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid periodUnit", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Bad goal",
          type: "boolean",
          periodicity: "count_per_period",
          periodUnit: "day",
          periodTarget: 3,
        }),
      })
    );
    expect(res.status).toBe(400);
  });
});
