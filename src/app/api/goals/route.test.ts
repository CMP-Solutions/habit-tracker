import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

describe("/api/goals", () => {
  let userId: string;

  beforeEach(async () => {
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "goal-test@example.com" } });
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
});
