import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

describe("PATCH /api/goals/[id]", () => {
  let userId: string;
  let goalId: string;

  beforeEach(async () => {
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "goal-patch-test@example.com" } });
    const user = await db.user.create({ data: { email: "goal-patch-test@example.com", passwordHash: "x" } });
    userId = user.id;
    const goal = await db.goal.create({
      data: { userId, title: "Schritte", type: "quantitative", unit: "Schritte", targetValue: 10000, periodicity: "daily" },
    });
    goalId = goal.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  const patch = (body: unknown) =>
    PATCH(new Request("http://localhost/api/goals/x", { method: "PATCH", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: goalId }),
    });

  it("switches a quantitative goal to count_per_period", async () => {
    const res = await patch({ periodicity: "count_per_period", periodUnit: "week", periodTarget: 3 });
    expect(res.status).toBe(200);
    const goal = await res.json();
    expect(goal.type).toBe("quantitative");
    expect(goal.periodicity).toBe("count_per_period");
    expect(goal.periodUnit).toBe("week");
    expect(goal.periodTarget).toBe(3);
  });

  it("still rejects count_per_period without a valid periodUnit", async () => {
    const res = await patch({ periodicity: "count_per_period", periodUnit: "day", periodTarget: 3 });
    expect(res.status).toBe(400);
  });
});
