import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

describe("POST /api/entries", () => {
  let userId: string;
  let goalId: string;

  beforeEach(async () => {
    await db.milestone.deleteMany({});
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "entry-test@example.com" } });
    const user = await db.user.create({ data: { email: "entry-test@example.com", passwordHash: "x" } });
    userId = user.id;
    const goal = await db.goal.create({
      data: { userId, title: "Sport", type: "boolean", periodicity: "daily" },
    });
    goalId = goal.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  it("creates an entry and returns no milestones below threshold", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ goalId, date: "2026-09-10", done: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.done).toBe(true);
    expect(body.newMilestones).toEqual([]);
  });

  it("upserts instead of duplicating an entry for the same day", async () => {
    const make = () =>
      POST(
        new Request("http://localhost/api/entries", {
          method: "POST",
          body: JSON.stringify({ goalId, date: "2026-09-10", done: true }),
        })
      );
    await make();
    await make();
    const count = await db.entry.count({ where: { goalId } });
    expect(count).toBe(1);
  });

  it("awards a 7-day streak milestone on the 7th consecutive success", async () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
    for (const date of dates) {
      await POST(new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date, done: true }) }));
    }
    const res = await POST(
      new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date: "2026-09-07", done: true }) })
    );
    const body = await res.json();
    expect(body.newMilestones).toEqual([{ type: "streak", threshold: 7 }]);

    const milestones = await db.milestone.findMany({ where: { goalId } });
    expect(milestones).toHaveLength(1);
  });

  it("does not award a 7-day streak when a calendar day was skipped", async () => {
    // Seven check-ins, but day 2026-09-07 is missing: the calendar streak is 1,
    // not 7. Before densification the route saw seven consecutive `true` rows
    // and falsely awarded the milestone.
    const dates = [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-08",
    ];
    let last: Response | undefined;
    for (const date of dates) {
      last = await POST(
        new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date, done: true }) })
      );
    }
    const body = await last!.json();
    expect(body.newMilestones).toEqual([]);
    expect(await db.milestone.count({ where: { goalId } })).toBe(0);
  });

  it("treats a gap between two check-ins as a broken streak", async () => {
    // Day 1 and day 10 only: the current streak is 1, so nothing is awarded and
    // the gap days are counted as failures (see densify unit tests for the
    // streak values themselves).
    for (const date of ["2026-09-01", "2026-09-10"]) {
      await POST(
        new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date, done: true }) })
      );
    }
    const entries = await db.entry.findMany({ where: { goalId } });
    expect(entries).toHaveLength(2);
    expect(await db.milestone.count({ where: { goalId } })).toBe(0);
  });

  it("rejects a malformed date with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ goalId, date: "not-a-date", done: true }),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/date/i);
  });

  it("rejects an impossible calendar date with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ goalId, date: "2026-02-31", done: true }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing goalId with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ date: "2026-09-10", done: true }),
      })
    );
    expect(res.status).toBe(400);
  });
});
